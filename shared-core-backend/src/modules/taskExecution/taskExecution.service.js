/**
 * 任务执行主链：Task → Controller v1 → Run → Steps → AI Router（真实 / fallback / mock）。
 */
const { decide } = require("../controller/controller.service");
const { executeForTask } = require("../ai/aiExecute.service");
const { getTaskStore, getTaskRunStore } = require("../../stores/registry");
const { userKey } = require("../../schemas/domain-stores.schema");
const { clipGoal } = require("../../schemas/controller.v1.schema");
const { AppError } = require("../../utils/AppError");
const { logger } = require("../../infra/logger");
const { config } = require("../../infra/config");
const entitlementAccountStore = require("../../stores/account/entitlement.store");
const { getResultStore, getHistoryStore } = require("../../stores/registry");
const { clipSummary } = require("../../schemas/history.schema");
const { writeSuccessfulPatternMemory } = require("../memory/memory.service");
const {
  buildTemplateSuggestion,
  logTemplateSuggested
} = require("../template/template.service");
const { recordAiUsage } = require("../usage/usage.service");
const { getStorageDimensions } = require("../../infra/context-dimensions");
const { getSettingsStore } = require("../../stores/registry");
const { resolveFlags } = require("../featureFlag/featureFlag.service");

/**
 * run 成功后沉淀 result / history；失败不反改 run 状态，仅打日志。
 */
async function writeResultAndHistory(payload) {
  const {
    requestId,
    userId,
    taskId,
    runId,
    prompt,
    finalResult,
    resultSourceType,
    success = true,
    market,
    locale,
    product
  } = payload;
  const rst = resultSourceType != null ? String(resultSourceType) : "mock";
  const resultStore = getResultStore();
  const historyStore = getHistoryStore();
  let historyId = null;

  const t0 = Date.now();
  try {
    await resultStore.create(
      {
        runId,
        taskId,
        userId,
        result: finalResult,
        resultSourceType: rst,
        success,
        market,
        locale,
        product
      },
      requestId
    );
    logger.info({
      event: "result_written",
      requestId,
      userId,
      taskId,
      runId,
      resultSourceType: rst,
      success,
      durationMs: Date.now() - t0
    });
  } catch (e) {
    logger.warn({
      event: "result_write_failed",
      requestId,
      userId,
      taskId,
      runId,
      resultSourceType: rst,
      success: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0
    });
  }

  const t1 = Date.now();
  try {
    const summary = clipSummary(
      (finalResult && finalResult.summary) || (finalResult && finalResult.ai && finalResult.ai.content) || prompt,
      400
    );
    const hist = await historyStore.create(
      {
        taskId,
        runId,
        userId,
        prompt,
        status: "success",
        resultSourceType: rst,
        summary,
        market,
        locale,
        product
      },
      requestId
    );
    historyId = hist.historyId;
    logger.info({
      event: "history_written",
      requestId,
      userId,
      taskId,
      runId,
      historyId,
      status: "success",
      resultSourceType: rst,
      durationMs: Date.now() - t1
    });
  } catch (e) {
    logger.warn({
      event: "history_write_failed",
      requestId,
      userId,
      taskId,
      runId,
      historyId: null,
      status: "success",
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t1
    });
  }

  return { historyId };
}

function extractUserPrompt(task) {
  if (!task || typeof task !== "object") return "";
  if (task.oneLinePrompt != null && String(task.oneLinePrompt).trim() !== "") {
    return String(task.oneLinePrompt).trim();
  }
  if (task.title != null && String(task.title).trim() !== "") {
    return String(task.title).trim();
  }
  const input = task.input && typeof task.input === "object" ? task.input : {};
  if (input.oneLinePrompt != null && String(input.oneLinePrompt).trim() !== "") {
    return String(input.oneLinePrompt).trim();
  }
  return "";
}

/**
 * @param {import('express').Request['context']} ctx
 * @param {string} taskId
 */
async function executeTaskService(ctx, taskId) {
  const start = Date.now();
  const userId = userKey(ctx);
  const requestId = ctx && ctx.requestId ? String(ctx.requestId) : null;
  const taskStore = getTaskStore();
  const taskRunStore = getTaskRunStore();

  const task = await taskStore.getById(ctx, taskId);
  if (!task) {
    throw new AppError("TASK_NOT_FOUND", "Task not found", 404);
  }
  if (String(task.userId || task.user_id || "") !== String(userId)) {
    throw new AppError("FORBIDDEN", "Task access denied", 403);
  }

  const prompt = extractUserPrompt(task);
  if (!prompt) {
    throw new AppError("VALIDATION_ERROR", "Task has no executable prompt", 400);
  }

  const product = String(ctx.product || config().defaultProduct || "aics")
    .trim()
    .toLowerCase();
  const dims = getStorageDimensions(ctx);
  const settingsStore = getSettingsStore();
  const [settings, flags] = await Promise.all([
    settingsStore.getByUser(ctx),
    resolveFlags(ctx)
  ]);
  const gate = { settings, flags };
  const entRow = await entitlementAccountStore.getForProduct(userId, product, requestId);
  const entitlement = entRow
    ? { plan: entRow.plan, quota: entRow.quota, used: entRow.used, status: entRow.status }
    : {};

  const decision = decide({
    userPrompt: prompt,
    attachments: [],
    templateContext: null,
    memoryHints: [],
    market: ctx.market != null ? String(ctx.market) : null,
    locale: ctx.locale != null ? String(ctx.locale) : null,
    entitlement
  });

  const stepsSnapshot = decision.plan.steps.map((s) => ({
    id: s.id,
    type: s.type,
    status: "pending",
    purpose: s.purpose
  }));

  let runId;
  let workingSteps = stepsSnapshot.map((s) => ({ ...s }));

  try {
    const runRecord = await taskRunStore.create(
      {
        taskId: String(task.id),
        userId,
        status: "pending",
        steps: workingSteps.map((s) => ({ ...s })),
        result: null,
        resultSourceType: "mock",
        market: dims.market,
        locale: dims.locale,
        product: dims.product
      },
      requestId
    );
    runId = runRecord.runId;
    if (!runId) {
      throw new AppError("INTERNAL_ERROR", "Run create returned no id", 500);
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("INTERNAL_ERROR", e.message || "run_create_failed", 500);
  }

  const persist = async (patch) => {
    await taskRunStore.update(
      {
        runId,
        userId,
        market: dims.market,
        locale: dims.locale,
        product: dims.product,
        ...patch,
        updatedAt: new Date().toISOString()
      },
      requestId
    );
  };

  try {
    await persist({
      status: "running",
      steps: workingSteps.map((s) => ({ ...s }))
    });

    for (let i = 0; i < workingSteps.length; i++) {
      workingSteps[i] = { ...workingSteps[i], status: "running" };
      await persist({
        status: "running",
        steps: workingSteps.map((s) => ({ ...s }))
      });
      await new Promise((r) => setTimeout(r, 15));
      workingSteps[i] = { ...workingSteps[i], status: "success" };
      await persist({
        status: "running",
        steps: workingSteps.map((s) => ({ ...s }))
      });
    }

    const execPack = await executeForTask(ctx, prompt, decision, entitlement, runId, gate);
    let resultSourceType = execPack.resultSourceType;
    if (resultSourceType === "ai_result" && !execPack.aiPayload) {
      resultSourceType = "fallback";
      execPack.errorCode = execPack.errorCode || "AI_EXECUTION_FAILED";
      execPack.errorMessage = execPack.errorMessage || "empty_ai_payload";
    }
    const routerMeta = execPack.router
      ? {
          provider: execPack.router.provider,
          model: execPack.router.model,
          route: execPack.router.route,
          reason: execPack.router.reason
        }
      : null;

    let finalResult;
    if (execPack.quotaExceeded) {
      finalResult = {
        summary: "[mock] 配额不足，本次未调用 AI。",
        plan: decision.plan,
        stepsCompleted: workingSteps.length,
        router: routerMeta,
        disclaimer: "quota_exceeded",
        quotaExceeded: true,
        mockReason: "quota_exceeded",
        resultSourceType: "mock"
      };
      resultSourceType = "mock";
    } else if (resultSourceType === "ai_result" && execPack.aiPayload) {
      const ai = execPack.aiPayload;
      finalResult = {
        summary:
          (ai.content && ai.content.slice(0, 500)) || `[ai] ${clipGoal(prompt)}`,
        ai,
        plan: decision.plan,
        stepsCompleted: workingSteps.length,
        router: routerMeta,
        resultSourceType: "ai_result"
      };
    } else if (resultSourceType === "fallback") {
      finalResult = {
        summary:
          "[fallback] 本次返回为降级结果：上游调用失败或超时。",
        plan: decision.plan,
        stepsCompleted: workingSteps.length,
        fallbackErrorCode: execPack.errorCode || "AI_EXECUTION_FAILED",
        fallbackMessage: execPack.errorMessage || "",
        router: routerMeta,
        disclaimer: "降级输出，非模型原始完成结果。",
        resultSourceType: "fallback"
      };
    } else {
      const shortPrompt = clipGoal(prompt);
      const gateReason = execPack.errorCode || (execPack.router && execPack.router.reason);
      let summary = `[mock] 占位结果：已按 Controller v1 规则处理「${shortPrompt}」`;
      if (gateReason === "settings_allow_ai_disabled") {
        summary = `[mock] 用户设置已关闭 AI：「${shortPrompt}」`;
      } else if (gateReason === "feature_flag_ai_disabled") {
        summary = `[mock] 能力开关已关闭 AI：「${shortPrompt}」`;
      } else if (gateReason === "ai_degraded_streak") {
        summary = `[mock] 连续 AI 调用失败过多，已暂时降级：「${shortPrompt}」`;
      }
      finalResult = {
        summary,
        plan: decision.plan,
        stepsCompleted: workingSteps.length,
        disclaimer: "Mock output only. No AI model was invoked.",
        router: routerMeta,
        resultSourceType: "mock",
        mockReason: gateReason || null
      };
    }

    const tplT0 = Date.now();
    let templateSuggestion = null;
    if (
      flags.template_enabled !== false &&
      decision.persistenceStrategy &&
      decision.persistenceStrategy.shouldSuggestTemplate
    ) {
      templateSuggestion = buildTemplateSuggestion({
        runId,
        prompt,
        decision,
        finalResult
      });
    }

    await persist({
      status: "success",
      steps: workingSteps.map((s) => ({ ...s })),
      result: finalResult,
      resultSourceType,
      templateSuggestion
    });

    const { historyId } = await writeResultAndHistory({
      requestId,
      userId,
      taskId: String(task.id),
      runId,
      prompt,
      finalResult,
      resultSourceType,
      success: true,
      market: dims.market,
      locale: dims.locale,
      product: dims.product
    });

    if (templateSuggestion) {
      logTemplateSuggested(ctx, templateSuggestion, runId, tplT0);
    }

    if (
      settings.autoWriteMemory !== false &&
      flags.memory_enabled !== false &&
      decision.persistenceStrategy &&
      decision.persistenceStrategy.shouldWriteMemory
    ) {
      await writeSuccessfulPatternMemory(ctx, {
        runId,
        prompt,
        summary:
          (finalResult && finalResult.summary) ||
          (finalResult && finalResult.ai && finalResult.ai.content && finalResult.ai.content.slice(0, 400)) ||
          prompt,
        finalResult
      });
    }

    if (resultSourceType === "ai_result" && finalResult && finalResult.ai) {
      await recordAiUsage(ctx, {
        userId,
        product,
        runId,
        execPack,
        requestId,
        market: dims.market,
        locale: dims.locale
      });
    }

    const durationMs = Date.now() - start;
    logger.info({
      event: "task_execution_run",
      requestId,
      userId,
      taskId: String(task.id),
      runId,
      steps: workingSteps,
      executionStrategy: decision.executionStrategy,
      riskLevel: decision.riskLevel,
      resultSourceType,
      provider: routerMeta && routerMeta.provider,
      model: routerMeta && routerMeta.model,
      route: routerMeta && routerMeta.route,
      durationMs,
      finalStatus: "success"
    });

    return {
      runId,
      status: "success",
      steps: workingSteps,
      result: finalResult,
      resultSourceType,
      historyId,
      persistenceStrategy: decision.persistenceStrategy,
      templateSuggestion
    };
  } catch (e) {
    const durationMs = Date.now() - start;
    try {
      await taskRunStore.update(
        {
          runId,
          userId,
          market: dims.market,
          locale: dims.locale,
          product: dims.product,
          status: "error",
          steps: workingSteps.map((s) => ({ ...s })),
          result: {
            error: e instanceof Error ? e.message : String(e),
            resultSourceType: "mock"
          },
          resultSourceType: "mock",
          updatedAt: new Date().toISOString()
        },
        requestId
      );
    } catch (_) {
      /* best-effort */
    }
    logger.info({
      event: "task_execution_run",
      requestId,
      userId,
      taskId: String(task.id),
      runId,
      steps: workingSteps,
      executionStrategy: decision.executionStrategy,
      riskLevel: decision.riskLevel,
      resultSourceType: "mock",
      durationMs,
      finalStatus: "error",
      error: e instanceof Error ? e.message : String(e)
    });
    if (e instanceof AppError) throw e;
    throw new AppError("INTERNAL_ERROR", e instanceof Error ? e.message : "execution_failed", 500);
  }
}

/**
 * @param {import('express').Request['context']} ctx
 * @param {string} runId
 */
async function getTaskRunByIdService(ctx, runId) {
  const userId = userKey(ctx);
  const requestId = ctx && ctx.requestId ? String(ctx.requestId) : null;
  const store = getTaskRunStore();
  const raw = await store.getById(String(runId || "").trim(), requestId);
  if (!raw || !raw.runId) {
    throw new AppError("RUN_NOT_FOUND", "Run not found", 404);
  }
  if (String(raw.userId) !== String(userId)) {
    throw new AppError("FORBIDDEN", "Run access denied", 403);
  }
  return raw;
}

module.exports = { executeTaskService, getTaskRunByIdService, extractUserPrompt };
