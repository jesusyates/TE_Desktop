/**
 * AI 执行编排：Router → Provider；不落 SDK于本层之外。
 */
const { config } = require("../../infra/config");
const { logger } = require("../../infra/logger");
const { AppError } = require("../../utils/AppError");
const { validatePromptForAi } = require("../../schemas/ai-request.schema");
const { normalizeAIResult } = require("../../schemas/ai-result.schema");
const { previewRoute, planAllowsAi } = require("./aiRouter.service");
const { decide } = require("../controller/controller.service");
const { chatComplete } = require("../../infra/ai/providers/openai.provider");
const entitlementAccountStore = require("../../stores/account/entitlement.store");
const { getSettingsStore } = require("../../stores/registry");
const { resolveFlags } = require("../featureFlag/featureFlag.service");
const {
  isAiDegraded,
  recordAiProviderFailure,
  recordAiProviderSuccess
} = require("../../infra/aiFailureStreak");

async function loadAiGate(ctx) {
  const store = getSettingsStore();
  const [settings, flags] = await Promise.all([store.getByUser(ctx), resolveFlags(ctx)]);
  return { settings, flags };
}

function loadEntitlement(ctx) {
  const userId = ctx && ctx.userId != null ? String(ctx.userId).trim() : "";
  const product = String(ctx.product || config().defaultProduct || "aics")
    .trim()
    .toLowerCase();
  return entitlementAccountStore.getForProduct(userId, product, ctx.requestId || null);
}

/**
 * POST /v1/ai/router/preview
 * @param {import('express').Request['context']} ctx
 * @param {object} body
 */
async function routerPreview(ctx, body) {
  const b = body && typeof body === "object" ? body : {};
  const prompt = validatePromptForAi(b.prompt != null ? String(b.prompt) : "");
  const entRow = await loadEntitlement(ctx);
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
  const userId = ctx && ctx.userId != null ? String(ctx.userId) : "";
  const gate = await loadAiGate(ctx);
  const tPrev = Date.now();
  const out = previewRoute({
    userPrompt: prompt,
    taskType: decision.taskType,
    complexity: decision.complexity,
    market: ctx.market,
    locale: ctx.locale,
    entitlement,
    requestId: ctx.requestId || null,
    userId,
    riskLevel: decision.riskLevel,
    settings: gate.settings,
    featureFlags: gate.flags
  });
  logger.info({
    event: "ai_router_preview",
    requestId: ctx.requestId || null,
    userId,
    provider: out.provider,
    model: out.model,
    route: out.route,
    canExecute: out.canExecute,
    reason: out.reason,
    durationMs: Date.now() - tPrev
  });
  return out;
}

/**
 * POST /v1/ai/execute — 独立验证通路；无模型调用时返回 mock结构（不冒充 ai_result）。
 * @param {import('express').Request['context']} ctx
 * @param {object} body
 */
async function standaloneExecute(ctx, body) {
  const b = body && typeof body === "object" ? body : {};
  const prompt = validatePromptForAi(b.prompt != null ? String(b.prompt) : "");
  const entRow = await loadEntitlement(ctx);
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
  const userId = ctx && ctx.userId != null ? String(ctx.userId) : "";
  const gate = await loadAiGate(ctx);
  const route = previewRoute({
    userPrompt: prompt,
    taskType: decision.taskType,
    complexity: decision.complexity,
    market: ctx.market,
    locale: ctx.locale,
    entitlement,
    requestId: ctx.requestId || null,
    userId,
    riskLevel: decision.riskLevel,
    settings: gate.settings,
    featureFlags: gate.flags
  });

  const c = config();
  const t0 = Date.now();

  if (!route.canExecute) {
    if (decision.riskLevel === "L4") {
      throw new AppError("AI_ROUTE_BLOCKED", "Execution blocked by risk policy (L4)", 403);
    }
    if (route.reason === "quota_exceeded") {
      throw new AppError("QUOTA_EXCEEDED", "Insufficient quota for AI execution", 403);
    }
    if (route.reason === "entitlement_blocked" || route.reason === "model_not_allowed") {
      throw new AppError("FORBIDDEN", "AI capability not available for this account", 403);
    }
    if (!planAllowsAi(entitlement)) {
      throw new AppError("FORBIDDEN", "AI capability not available for this account", 403);
    }
    if (route.reason === "feature_flag_ai_disabled" || route.reason === "settings_allow_ai_disabled") {
      logger.info({
        event: "ai_execute",
        requestId: ctx.requestId || null,
        userId,
        provider: route.provider,
        model: route.model,
        route: route.route,
        resultSourceType: "mock",
        durationMs: Date.now() - t0,
        success: true,
        errorCode: route.reason
      });
      return {
        resultSourceType: "mock",
        router: route,
        result: {
          summary:
            route.reason === "feature_flag_ai_disabled"
              ? "[mock] 能力开关已关闭 AI，未调用模型。"
              : "[mock] 用户设置已关闭 AI，未调用模型。",
          content: "",
          disclaimer: "Mock only."
        }
      };
    }
    const hasKey = Boolean(c.openaiApiKey && String(c.openaiApiKey).trim() !== "");
    if (!hasKey) {
      logger.info({
        event: "ai_execute",
        requestId: ctx.requestId || null,
        userId,
        provider: route.provider,
        model: route.model,
        route: route.route,
        resultSourceType: "mock",
        durationMs: Date.now() - t0,
        success: true,
        errorCode: null
      });
      return {
        resultSourceType: "mock",
        router: route,
        result: {
          summary: "[mock] 未配置 OPENAI_API_KEY，未调用模型。",
          content: "",
          disclaimer: "Mock only."
        }
      };
    }
    throw new AppError("AI_ROUTE_BLOCKED", route.reason || "cannot_execute", 403);
  }

  if (isAiDegraded(userId)) {
    logger.info({
      event: "ai_execute",
      requestId: ctx.requestId || null,
      userId,
      provider: route.provider,
      model: route.model,
      route: route.route,
      resultSourceType: "mock",
      durationMs: Date.now() - t0,
      success: true,
      errorCode: "ai_degraded_streak"
    });
    return {
      resultSourceType: "mock",
      router: route,
      result: {
        summary: "[mock] 连续调用失败过多，已暂时降级为占位输出。",
        content: "",
        disclaimer: "Mock only."
      }
    };
  }

  try {
    const modelUse = route.model || c.aiModelDefault;
    const raw = await chatComplete({
      prompt: prompt.slice(0, c.aiMaxPromptChars),
      model: modelUse,
      timeoutMs: c.aiTimeoutMs,
      apiKey: c.openaiApiKey
    });
    const normalized = normalizeAIResult({
      content: raw.content,
      provider: "openai",
      model: modelUse,
      usage: {
        inputTokens: raw.usage.prompt_tokens,
        outputTokens: raw.usage.completion_tokens,
        totalTokens: raw.usage.total_tokens
      },
      finishReason: raw.finishReason
    });
    logger.info({
      event: "ai_execute",
      requestId: ctx.requestId || null,
      userId,
      provider: route.provider,
      model: route.model,
      route: route.route,
      resultSourceType: "ai_result",
      durationMs: Date.now() - t0,
      success: true,
      errorCode: null
    });
    recordAiProviderSuccess(userId);
    return {
      resultSourceType: "ai_result",
      router: route,
      result: normalized
    };
  } catch (e) {
    const code = e instanceof AppError ? e.code : "AI_EXECUTION_FAILED";
    if (code === "AI_TIMEOUT" || code === "AI_EXECUTION_FAILED") {
      recordAiProviderFailure(userId, ctx.requestId || null, code);
    }
    logger.warn({
      event: "ai_execute",
      requestId: ctx.requestId || null,
      userId,
      provider: route.provider,
      model: route.model,
      route: route.route,
      resultSourceType: "fallback",
      durationMs: Date.now() - t0,
      success: false,
      errorCode: code,
      error: e instanceof Error ? e.message : String(e)
    });
    return {
      resultSourceType: "fallback",
      router: route,
      result: {
        content: "",
        summary:
          "[fallback] 本次返回为降级结果：上游调用失败或超时。",
        disclaimer: "降级输出，非模型原始完成结果。",
        errorCode: code,
        errorMessage: e instanceof Error ? e.message : String(e)
      }
    };
  }
}

/**
 * 供 taskExecution 调用：不抛业务403，仅返回包。
 * @param {import('express').Request['context']} ctx
 * @param {string} prompt
 * @param {object} decision — controller 输出
 * @param {object} entitlement — 摘要
 * @param {string|null} runId
 * @param {{ settings: object, flags: object }|null} gate — 由 taskExecution 预加载时可传入，避免重复读
 */
async function executeForTask(ctx, prompt, decision, entitlement, runId = null, gate = null) {
  const userId = ctx && ctx.userId != null ? String(ctx.userId) : "";
  const requestId = ctx && ctx.requestId ? String(ctx.requestId) : null;
  const rid = runId != null ? String(runId) : null;
  const resolvedGate = gate || (await loadAiGate(ctx));
  const route = previewRoute({
    userPrompt: prompt,
    taskType: decision.taskType,
    complexity: decision.complexity,
    market: ctx.market != null ? String(ctx.market) : null,
    locale: ctx.locale != null ? String(ctx.locale) : null,
    entitlement,
    requestId,
    userId,
    riskLevel: decision.riskLevel,
    settings: resolvedGate.settings,
    featureFlags: resolvedGate.flags
  });

  const c = config();
  const t0 = Date.now();

  if (!route.canExecute) {
    if (route.reason === "quota_exceeded") {
      const rem =
        entitlement && Number.isFinite(Number(entitlement.quota)) && Number.isFinite(Number(entitlement.used))
          ? Math.max(0, Number(entitlement.quota) - Number(entitlement.used))
          : 0;
      logger.info({
        event: "quota_exceeded",
        requestId,
        userId,
        runId: rid,
        tokens: 0,
        cost: 0,
        remaining: rem
      });
    }
    logger.info({
      event: "ai_execute",
      requestId,
      userId,
      provider: route.provider,
      model: route.model,
      route: route.route,
      resultSourceType: "mock",
      durationMs: Date.now() - t0,
      success: true,
      errorCode: route.reason
    });
    return {
      resultSourceType: "mock",
      router: route,
      aiPayload: null,
      errorCode:
        route.reason === "quota_exceeded"
          ? "quota_exceeded"
          : route.reason === "feature_flag_ai_disabled" || route.reason === "settings_allow_ai_disabled"
            ? route.reason
            : null,
      quotaExceeded: route.reason === "quota_exceeded"
    };
  }

  if (isAiDegraded(userId)) {
    logger.info({
      event: "ai_execute",
      requestId,
      userId,
      provider: route.provider,
      model: route.model,
      route: route.route,
      resultSourceType: "mock",
      durationMs: Date.now() - t0,
      success: true,
      errorCode: "ai_degraded_streak"
    });
    return {
      resultSourceType: "mock",
      router: route,
      aiPayload: null,
      errorCode: "ai_degraded_streak",
      quotaExceeded: false
    };
  }

  try {
    const modelUse = route.model || c.aiModelDefault;
    const raw = await chatComplete({
      prompt: prompt.slice(0, c.aiMaxPromptChars),
      model: modelUse,
      timeoutMs: c.aiTimeoutMs,
      apiKey: c.openaiApiKey
    });
    const normalized = normalizeAIResult({
      content: raw.content,
      provider: "openai",
      model: modelUse,
      usage: {
        inputTokens: raw.usage.prompt_tokens,
        outputTokens: raw.usage.completion_tokens,
        totalTokens: raw.usage.total_tokens
      },
      finishReason: raw.finishReason
    });
    logger.info({
      event: "ai_execute",
      requestId,
      userId,
      provider: route.provider,
      model: route.model,
      route: route.route,
      resultSourceType: "ai_result",
      durationMs: Date.now() - t0,
      success: true,
      errorCode: null
    });
    recordAiProviderSuccess(userId);
    return { resultSourceType: "ai_result", router: route, aiPayload: normalized, errorCode: null };
  } catch (e) {
    const code = e instanceof AppError ? e.code : "AI_EXECUTION_FAILED";
    if (code === "AI_TIMEOUT" || code === "AI_EXECUTION_FAILED") {
      recordAiProviderFailure(userId, requestId, code);
    }
    logger.warn({
      event: "ai_execute",
      requestId,
      userId,
      provider: route.provider,
      model: route.model,
      route: route.route,
      resultSourceType: "fallback",
      durationMs: Date.now() - t0,
      success: false,
      errorCode: code,
      error: e instanceof Error ? e.message : String(e)
    });
    return {
      resultSourceType: "fallback",
      router: route,
      aiPayload: null,
      errorCode: code,
      errorMessage: e instanceof Error ? e.message : String(e)
    };
  }
}

module.exports = { routerPreview, standaloneExecute, executeForTask, loadAiGate };
