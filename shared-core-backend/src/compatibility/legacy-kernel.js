/**
 * Shared Core HTTP 服务入口。
 *
 * 禁止项（模块 C — 注释必须齐备）：
 * - 禁止创建第二套用户系统；
 * - 禁止本地身份作为权威；
 * - 所有鉴权必须走 Shared Core；
 * - 禁止 Web / Desktop 分裂 Auth；
 * - 禁止独立 Web UI（本仓库以桌面为主；Web 仅辅助说明见 web-auth-stub）。
 *
 * 最终强约束（须遵守）：禁止 mock；禁止绕过 Shared Core；禁止多用户体系；禁止本地 Auth 成为权威。
 *
 * 补充：禁止客户端直连模型或自签绕过 Content Safety / Router。当前 auth 为进程内实现，生产须替换为持久化 Core，接口语义不变。
 *
 * C-3：禁止客户端缓存 quota 为权威；禁止绕过 entitlement middleware 执行 /api/tasks；
 * 禁止改 entitlement 字段名；单一 quota + usage 模型。
 *
 * C-4：禁止前端 body 提交 user_id 作权威；禁止执行层再读 header/session 覆盖 req.context；
 * 禁止 market/locale 缺失静默写死；禁止 Web/Desktop 不同 identity 结构。
 *
 * C-5：偏好读写见 preferences/*；禁止 IP 锁定国家/语言；登录后以 Core preference 为准。
 *
 * C-6：stale access 不 401；X-Session-Refresh-Recommended；send(req,…) 附带标头；禁止 refresh 风暴；preference 更新后 bump session_version。
 *
 * C-7：默认 SQLite 持久化（storage/*）；禁止第二套用户/计费；禁止业务层直写 SQL；禁止无 migrate 启动。
 * 环境变量：SHARED_CORE_DB_PATH、SHARED_CORE_STORAGE=memory 可选回退。
 *
 * C-8：req.identitySnapshot 固化身份；task_run / generate 同 task_id；禁止 generate 重读 header 拼身份。
 *
 * 环境变量：由 src/main.js 统一 bootstrap —见 infra/config。
 *
 * Legacy 路由内核（原 server.js）；由 Express 挂载。禁止在此重复做 storage / auth 环境初始化。
 */
const path = require("path");
const { randomUUID } = require("crypto");
const { URL } = require("url");
const { generateStepResult } = require("../../generateExecutionResult");

const { readBearerFromReq, resolveSessionAsync } = require("../../auth/session.middleware");

function pickCompatAuthHandlers() {
  const { isAuthProviderSupabase } = require("../../auth/auth-provider.util");
  const legacyH = require("../../auth/auth.handlers");
  const supaH = require("../../auth/supabase.handlers");
  const handlers = isAuthProviderSupabase() ? supaH : legacyH;
  if (isAuthProviderSupabase() && handlers === legacyH) {
    throw new Error("LEGACY_AUTH_DISABLED_IN_SUPABASE_MODE");
  }
  return handlers;
}
const { authLog } = require("../../auth/auth.log");
const { parseClientHeaders } = require("../../auth/client-meta.util");
const { requireEntitlementOr402 } = require("../../billing/billing.middleware");
const entitlementService = require("../../billing/entitlement.service");
const { recordUsage } = require("../../billing/usage.service");
const { buildRequestContext } = require("../../context/request-context.middleware");
const { planTasks, computePlannerSteps } = require("../../planner/planner.context");
const { buildTaskContext, buildRunContext } = require("../../tasks/task.context");
const { buildPromptContext } = require("../../prompts/prompt-context.util");
const {
  handleGetPreferencesMe,
  handlePutPreferencesMe
} = require("../../preferences/preferences.handlers");
const { assertRequestContext } = require("../../context/context-assert.util");
const { buildIdentitySnapshot, assertIdentitySnapshot } = require("../../context/identity-snapshot.util");
const { identitySnapshotLog } = require("../../context/identity-snapshot.log");
const { sessionLog } = require("../../auth/session.log");
const taskAuditService = require("../../tasks/task-audit.service");
const { handleCreate: handleToolRequestCreate, handleList: handleToolRequestList } = require("../../tools/tool-request.handlers");
const capabilityRegistryHttp = require("../../../runtime/capabilities/capability.registry.js");
const capabilityResolverHttp = require("../../../runtime/capabilities/capability.resolver.js");
const historyService = require("../../history/history.service");
const {
  handleGetHistoryList,
  handleGetHistoryOne,
  handleDeleteHistory,
  handlePostHistory
} = require("../../history/history.handlers");
const { handleDesktopUpdateCheck } = require("../../desktop-update/desktop-update.handlers");

/** D-1：DELETE /history/:id（非 /history/list） */
const parseHistoryResourceId = (pathname) => {
  if (!pathname.startsWith("/history/")) return null;
  const rest = pathname.slice("/history/".length);
  if (!rest || rest.includes("/") || rest === "list") return null;
  return rest;
};

/** Shared Core：受保护路由必须携带合法 Bearer + 标准 Client Header，并写入 req.session。 */
const requireSessionOr401 = async (req, res) => {
  if (!(await resolveSessionAsync(req))) {
    const meta = parseClientHeaders(req);
    authLog({
      event: "auth_401",
      user_id: null,
      jti: null,
      client_platform: "error" in meta ? null : meta.client_platform,
      product: "error" in meta ? null : meta.product
    });
    send(req, res, 401, { message: "unauthorized" });
    return false;
  }
  return true;
};

const db = {
  tasks: new Map(),
  stepsByTask: new Map(),
  logsByTask: new Map()
};

const send = (req, res, status, data) => {
  const recommend =
    req &&
    req.sessionRefreshRecommended &&
    status >= 200 &&
    status < 400;
  if (recommend) {
    sessionLog({
      event: "session_refresh_recommended",
      user_id: req.session ? req.session.user_id : null,
      market: req.session ? req.session.market : null,
      locale: req.session ? req.session.locale : null,
      product: req.session ? req.session.product : null,
      client_platform: req.session ? req.session.client_platform : null
    });
    res.set("X-Session-Refresh-Recommended", "1");
  }
  res.status(status).json(data);
};

const mapStepForClient = (s) => ({
  id: s.id,
  title: s.title,
  order: s.stepOrder,
  action: s.actionName || "call-api",
  status: s.status,
  input: s.input || {},
  output: s.output !== undefined ? s.output : undefined,
  error: s.error || undefined,
  errorType: s.errorType || undefined,
  latency: s.latency || 0
});

/** Express express.json() 已解析；无 body 时视为 {} */
function getJsonBody(req) {
  if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  return {};
}

const now = () => new Date().toISOString();

async function requireAuthContext(req, res) {
  if (!(await requireSessionOr401(req, res))) return false;
  return buildRequestContext(req, res, send);
}

/** POST /api/tasks — build in-memory task + row skeleton from client body. */
const buildTaskFromInput = (body) => {
  const oneLinePrompt = body.oneLinePrompt || "";
  const importedMaterials = Array.isArray(body.importedMaterials) ? body.importedMaterials : [];
  const routerDecision =
    body.routerDecision != null && typeof body.routerDecision === "object"
      ? body.routerDecision
      : undefined;
  const id = `task_${randomUUID()}`;
  const t = now();
  const input = { oneLinePrompt, importedMaterials, ...(routerDecision ? { routerDecision } : {}) };
  const taskRow = {
    id,
    prompt: oneLinePrompt,
    sourceTaskId: null,
    runType: "new",
    plannerSource: "remote",
    status: "pending",
    input,
    result: null,
    lastErrorSummary: null,
    createdAt: t,
    updatedAt: t
  };
  return { id, input, taskRow, startedAt: t };
};

/**
 * Run planner + executor（C-4 / C-8：context + identity_snapshot 只读传入，禁止再读 req）。
 * @param {{ context: object, identity_snapshot: object, built: object }} args
 */
const runTask = async ({ context: requestContext, identity_snapshot, built }) => {
  const assertSnap = assertIdentitySnapshot(identity_snapshot, {
    allowNullEntitlement: false,
    task_id: built.taskRow.id
  });
  if (!assertSnap.ok) {
    return { error: true, code: "identity_snapshot_invalid" };
  }
  buildTaskContext(requestContext);
  buildRunContext(requestContext);

  const { taskRow, input } = built;
  const { oneLinePrompt, importedMaterials } = input;
  const taskPrompt = oneLinePrompt || "未命名任务";
  const routerDecision = input.routerDecision != null ? input.routerDecision : null;

  if (routerDecision && typeof routerDecision === "object") {
    const { runAiGateway } = require(path.join(__dirname, "..", "..", "..", "aics-core", "aiGateway", "gatewayEngine.js"));

    const usageGateway = recordUsage(requestContext.userId, requestContext.product, "generate", 1, {
      identity_snapshot,
      task_id: built.taskRow.id
    });
    if (!usageGateway.ok) {
      return { error: true, code: usageGateway.code };
    }

    let workingRow = { ...taskRow, status: "running", updatedAt: now() };
    const t0 = Date.now();
    const gatewayText = await runAiGateway({ routerDecision, prompt: taskPrompt });
    const latency = Date.now() - t0;
    const stepId = "1";
    const tsDone = now();
    const doneStep = {
      id: stepId,
      stepOrder: 1,
      title: "AI 生成",
      actionName: "generate-content",
      status: "success",
      input: {},
      output: gatewayText,
      errorType: null,
      error: null,
      latency,
      updatedAt: tsDone
    };
    const stepsForDb = [doneStep];
    const stepsPayload = [{ id: stepId, order: 1, title: "AI 生成", status: "success", latency }];
    const logsForTask = [{ stepId, content: gatewayText }];
    const tEnd = now();
    const resultPayload = {
      title: taskPrompt.trim().slice(0, 20) || "未命名主题",
      content: gatewayText
    };
    const resultFull = {
      title: resultPayload.title,
      hook: "",
      contentStructure: "",
      body: gatewayText,
      copywriting: "",
      tags: [],
      publishSuggestion: ""
    };
    const doneRow = {
      ...workingRow,
      status: "success",
      result: resultFull,
      updatedAt: tEnd
    };
    return {
      taskRow: doneRow,
      stepsForDb,
      stepsPayload,
      resultPayload,
      logsForTask
    };
  }

  const planned = computePlannerSteps(taskPrompt);

  let priorStepOutput =
    Array.isArray(importedMaterials) && importedMaterials.length > 0
      ? `（已导入 ${importedMaterials.length} 条资料）`
      : "";

  const logsForTask = [];
  const stepsForDb = [];
  const stepsPayload = [];
  let lastStepContent = "";

  let workingRow = { ...taskRow, status: "running", updatedAt: now() };

  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    const stepId = String(i + 1);
    const t0 = Date.now();
    const tsRunning = now();

    const usageBeforeGenerate = recordUsage(requestContext.userId, requestContext.product, "generate", 1, {
      identity_snapshot,
      task_id: built.taskRow.id
    });
    if (!usageBeforeGenerate.ok) {
      return { error: true, code: usageBeforeGenerate.code };
    }

    const runningStep = {
      id: stepId,
      stepOrder: p.stepOrder,
      title: p.title,
      actionName: p.action,
      status: "running",
      input: p.input || {},
      output: null,
      errorType: null,
      error: null,
      latency: 0,
      updatedAt: tsRunning
    };
    stepsForDb.push(runningStep);
    stepsPayload.push({
      id: stepId,
      order: p.stepOrder,
      title: p.title,
      status: "running",
      latency: 0
    });
    workingRow = { ...workingRow, updatedAt: now() };

    const prompt_context = buildPromptContext(requestContext);
    let stepResult;
    try {
      stepResult = await generateStepResult({
        stepTitle: p.title,
        prompt: taskPrompt,
        executionContext: priorStepOutput,
        requestContext,
        identity_snapshot,
        task_id: built.taskRow.id,
        prompt_context
      });
    } catch (genErr) {
      const code = genErr && genErr.code ? genErr.code : "ai_generation_failed";
      const detail = genErr && genErr.detail != null ? String(genErr.detail) : genErr instanceof Error ? genErr.message : String(genErr);
      return { error: true, code, detail };
    }

    const latency = Date.now() - t0;
    const tsDone = now();

    const doneStep = {
      ...runningStep,
      status: "success",
      output: stepResult.content,
      latency,
      updatedAt: tsDone
    };
    stepsForDb[stepsForDb.length - 1] = doneStep;
    stepsPayload[stepsPayload.length - 1] = {
      id: stepId,
      order: p.stepOrder,
      title: p.title,
      status: "success",
      latency
    };
    workingRow = { ...workingRow, updatedAt: tsDone };

    logsForTask.push({
      stepId,
      content: stepResult.content
    });

    lastStepContent = stepResult.content;
    priorStepOutput = stepResult.content;
  }

  const t = now();
  const resultPayload = {
    title: taskPrompt.trim().slice(0, 20) || "未命名主题",
    content: lastStepContent
  };

  const resultFull = {
    title: resultPayload.title,
    hook: "",
    contentStructure: "",
    body: resultPayload.content,
    copywriting: "",
    tags: [],
    publishSuggestion: ""
  };

  const doneRow = {
    ...workingRow,
    status: "success",
    result: resultFull,
    updatedAt: t
  };

  return {
    taskRow: doneRow,
    stepsForDb,
    stepsPayload,
    resultPayload,
    logsForTask
  };
};

/** Map internal run outcome to POST /api/tasks JSON (must stay stable for renderer). */
const formatTaskResponse = (taskRow, stepsPayload, resultPayload) => ({
  id: taskRow.id,
  status: taskRow.status,
  steps: stepsPayload,
  result: resultPayload
});

const parseTaskId = (pathname) => {
  const m = pathname.match(/^\/aics\/execution\/tasks\/([^/]+)$/);
  return m ? m[1] : null;
};

const parseStepPath = (pathname) => {
  const m = pathname.match(/^\/aics\/execution\/tasks\/([^/]+)\/steps\/([^/]+)$/);
  return m ? { taskId: m[1], stepId: m[2] } : null;
};

const parseLogsPath = (pathname) => {
  const m = pathname.match(/^\/aics\/execution\/tasks\/([^/]+)\/logs$/);
  return m ? m[1] : null;
};

const parseRerunPath = (pathname) => {
  const m = pathname.match(/^\/aics\/execution\/tasks\/([^/]+):rerun$/);
  return m ? m[1] : null;
};

/** POST …/pause | /resume | /cancel — D-2-4 桌面控制条对接（内存任务） */
const parseLifecyclePath = (pathname) => {
  const m = pathname.match(/^\/aics\/execution\/tasks\/([^/]+)\/(pause|resume|cancel)$/);
  return m ? { taskId: m[1], action: m[2] } : null;
};

async function legacyKernelHandler(req, res) {
  const method = req.method || "GET";
  const parsed = new URL(req.originalUrl || req.url || "/", "http://127.0.0.1");
  const pathname = parsed.pathname;

  try {
    const _auth = pickCompatAuthHandlers();

    /** AICS 桌面：更新检查（无 Bearer；策略由服务端返回 updateType） */
    if (method === "GET" && pathname === "/aics/desktop/update-check") {
      const r = handleDesktopUpdateCheck(req, parsed.searchParams);
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/auth/login") {
      const body = getJsonBody(req);
      const r = await Promise.resolve(_auth.handleAuthLogin(req, body));
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/auth/register") {
      const body = getJsonBody(req);
      const r = await Promise.resolve(_auth.handleAuthRegister(req, body));
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/auth/verify-email") {
      const body = getJsonBody(req);
      const r = await Promise.resolve(_auth.handleAuthVerifyEmail(req, body));
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/auth/resend-verification") {
      const body = getJsonBody(req);
      const r = await Promise.resolve(_auth.handleAuthResendVerification(req, body));
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/auth/forgot-password") {
      const body = getJsonBody(req);
      const r = await Promise.resolve(_auth.handleAuthForgotPassword(req, body));
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/auth/reset-password") {
      const body = getJsonBody(req);
      const r = await Promise.resolve(_auth.handleAuthResetPassword(req, body));
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/auth/refresh") {
      const body = getJsonBody(req);
      const r = await Promise.resolve(_auth.handleAuthRefresh(req, body));
      return send(req, res, r.status, r.body);
    }

    if (method === "GET" && pathname === "/auth/me") {
      const r = await Promise.resolve(_auth.handleAuthMe(req, readBearerFromReq(req)));
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/auth/logout") {
      const body = getJsonBody(req);
      const r = await Promise.resolve(_auth.handleAuthLogout(req, body));
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/api/tasks") {
      if (!(await requireSessionOr401(req, res))) return;
      const body = getJsonBody(req);
      const built = buildTaskFromInput(body);
      req.taskIdForUsage = built.id;
      if (!requireEntitlementOr402(req, res, send, 1)) return;
      if (!buildRequestContext(req, res, send)) return;
      if (!assertRequestContext(req, { requireEntitlement: true })) {
        return send(req, res, 500, { message: "context_assert_fail" });
      }
      req.identitySnapshot = buildIdentitySnapshot(req);
      identitySnapshotLog({
        event: "identity_snapshot_created",
        task_id: built.id,
        user_id: req.identitySnapshot.user_id,
        market: req.identitySnapshot.market,
        locale: req.identitySnapshot.locale,
        product: req.identitySnapshot.product,
        client_platform: req.identitySnapshot.client_platform,
        session_version: req.identitySnapshot.session_version
      });
      const preAssert = assertIdentitySnapshot(req.identitySnapshot, {
        allowNullEntitlement: false,
        task_id: built.id
      });
      if (!preAssert.ok) {
        return send(req, res, 500, { message: "identity_snapshot_invalid" });
      }
      taskAuditService.createTaskAudit(built.id, req.identitySnapshot);
      let outcome;
      try {
        outcome = await runTask({
          context: req.context,
          identity_snapshot: req.identitySnapshot,
          built
        });
      } catch (taskErr) {
        if (taskErr && taskErr.message === "identity_snapshot_invalid") {
          taskAuditService.failTaskAudit(built.id, req.identitySnapshot);
          return send(req, res, 500, { message: "identity_snapshot_invalid" });
        }
        taskAuditService.failTaskAudit(built.id, req.identitySnapshot);
        throw taskErr;
      }
      if (outcome.error) {
        if (outcome.code === "identity_snapshot_invalid" || outcome.code === "context_assert_fail") {
          taskAuditService.failTaskAudit(built.id, req.identitySnapshot);
          return send(req, res, 500, { message: outcome.code });
        }
        const aiCodes = new Set([
          "ai_router_required",
          "ai_router_timeout",
          "ai_router_network_error",
          "ai_router_http_error",
          "ai_router_invalid_json",
          "ai_router_empty_choice",
          "ai_generation_failed"
        ]);
        if (aiCodes.has(outcome.code)) {
          taskAuditService.failTaskAudit(built.id, req.identitySnapshot);
          try {
            historyService.append({
              user_id: req.context.userId,
              prompt: String(built.taskRow.prompt || "").trim() || "（无标题）",
              preview: String((outcome.detail || outcome.code || "")).slice(0, 200),
              status: "error",
              mode: "ai"
            });
          } catch (histErr) {
            console.error("[history] append (ai error)", histErr.message || histErr);
          }
          return send(req, res, 503, {
            message: outcome.code,
            detail: outcome.detail || undefined
          });
        }
        if (outcome.code === "quota_exceeded") {
          taskAuditService.markTaskAuditQuotaBlocked(built.id, req.identitySnapshot);
          return send(req, res, 402, { message: outcome.code });
        }
        if (outcome.code === "invalid_amount") {
          taskAuditService.failTaskAudit(built.id, req.identitySnapshot);
          return send(req, res, 400, { message: outcome.code });
        }
        taskAuditService.failTaskAudit(built.id, req.identitySnapshot);
        if (outcome.code === "entitlement_inactive") {
          return send(req, res, 403, { message: outcome.code });
        }
        return send(req, res, 402, { message: outcome.code });
      }
      const { taskRow, stepsForDb, stepsPayload, resultPayload, logsForTask } = outcome;
      db.tasks.set(taskRow.id, taskRow);
      db.stepsByTask.set(taskRow.id, stepsForDb);
      db.logsByTask.set(taskRow.id, logsForTask);
      const payload = formatTaskResponse(taskRow, stepsPayload, resultPayload);
      if (process.env.AICS_DEBUG_CONTEXT === "1") {
        payload.identity_summary = {
          user_id: req.context.userId,
          market: req.context.market,
          locale: req.context.locale,
          product: req.context.product,
          client_platform: req.context.platform
        };
      }
      taskAuditService.completeTaskAudit(built.id, req.identitySnapshot);
      try {
        historyService.append({
          user_id: req.context.userId,
          prompt: String(taskRow.prompt || "").trim() || "（无标题）",
          preview: historyService.previewFromExecutionTask(taskRow),
          status: "success",
          mode: "ai"
        });
      } catch (histErr) {
        console.error("[history] append (api/tasks ok)", histErr.message || histErr);
      }
      return send(req, res, 200, payload);
    }

    if (method === "GET" && pathname === "/billing/entitlement") {
      if (!(await requireAuthContext(req, res))) return;
      const ent = entitlementService.getEntitlement(req.context.userId, req.context.product);
      return send(req, res, 200, {
        user_id: ent.user_id,
        product: ent.product,
        plan: ent.plan,
        quota: ent.quota,
        used: ent.used,
        status: ent.status,
        market: req.context.market,
        locale: req.context.locale
      });
    }

    if (method === "GET" && pathname === "/preferences/me") {
      if (!(await requireAuthContext(req, res))) return;
      const r = handleGetPreferencesMe(req);
      return send(req, res, r.status, r.body);
    }

    if (method === "PUT" && pathname === "/preferences/me") {
      if (!(await requireAuthContext(req, res))) return;
      const body = getJsonBody(req);
      const r = handlePutPreferencesMe(req, body);
      if (r.status === 200) {
        /** C-6：偏好 bump session_version 后必须提示客户端 refresh，否则旧 JWT 长期携带陈旧 session_version。 */
        req.sessionRefreshRecommended = true;
      }
      return send(req, res, r.status, r.body);
    }

    if (method === "GET" && pathname === "/history/list") {
      if (!(await requireAuthContext(req, res))) return;
      const r = handleGetHistoryList(req, parsed.searchParams);
      return send(req, res, r.status, r.body);
    }

    const historyResourceId = parseHistoryResourceId(pathname);
    if (method === "GET" && historyResourceId) {
      if (!(await requireAuthContext(req, res))) return;
      const r = handleGetHistoryOne(req, historyResourceId);
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/history/list") {
      if (!(await requireAuthContext(req, res))) return;
      const body = getJsonBody(req);
      const sp = new URLSearchParams();
      sp.set("page", String(body && body.page != null ? body.page : 1));
      sp.set("pageSize", String(body && body.pageSize != null ? body.pageSize : 20));
      const r = handleGetHistoryList(req, sp);
      return send(req, res, r.status, r.body);
    }

    const historyDeleteId = method === "DELETE" ? historyResourceId : null;
    if (historyDeleteId) {
      if (!(await requireAuthContext(req, res))) return;
      const r = handleDeleteHistory(req, historyDeleteId);
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/history") {
      if (!(await requireAuthContext(req, res))) return;
      const body = getJsonBody(req);
      const r = handlePostHistory(req, body);
      return send(req, res, r.status, r.body);
    }

    if (method === "POST" && pathname === "/aics/tool-requests") {
      if (!(await requireAuthContext(req, res))) return;
      if (!assertRequestContext(req, { requireEntitlement: false })) {
        return send(req, res, 500, { message: "context_assert_fail" });
      }
      const body = getJsonBody(req);
      const r = handleToolRequestCreate(req, body);
      return send(req, res, r.status, r.body);
    }

    if (method === "GET" && pathname === "/aics/tool-requests") {
      if (!(await requireAuthContext(req, res))) return;
      if (!assertRequestContext(req, { requireEntitlement: false })) {
        return send(req, res, 500, { message: "context_assert_fail" });
      }
      const r = handleToolRequestList(req);
      return send(req, res, r.status, r.body);
    }

    if (method === "GET" && pathname === "/aics/capability-catalog") {
      if (!(await requireAuthContext(req, res))) return;
      if (!assertRequestContext(req, { requireEntitlement: false })) {
        return send(req, res, 500, { message: "context_assert_fail" });
      }
      const loc = parsed.searchParams.get("locale") || req.context.locale || "en-US";
      const items = capabilityRegistryHttp.getAllCapabilities().map((c) => ({
        id: c.capability,
        label: c.label[loc] || c.label["en-US"] || c.capability,
        keywords: Array.isArray(c.infer_keywords) ? c.infer_keywords : [],
        expectLocalApp: Array.isArray(c.tool_candidates) && c.tool_candidates.length > 0
      }));
      return send(req, res, 200, { items });
    }

    if (method === "POST" && pathname === "/aics/capabilities:infer") {
      if (!(await requireAuthContext(req, res))) return;
      if (!assertRequestContext(req, { requireEntitlement: false })) {
        return send(req, res, 500, { message: "context_assert_fail" });
      }
      const body = getJsonBody(req);
      const oneLine = body.oneLine != null ? String(body.oneLine) : "";
      const stepTitles = Array.isArray(body.stepTitles) ? body.stepTitles.map((x) => String(x)) : [];
      const required = capabilityResolverHttp.inferRequiredCapabilities(oneLine, stepTitles);
      return send(req, res, 200, { required });
    }

    if (method === "POST" && pathname === "/aics/capabilities:resolve") {
      if (!(await requireAuthContext(req, res))) return;
      if (!assertRequestContext(req, { requireEntitlement: false })) {
        return send(req, res, 500, { message: "context_assert_fail" });
      }
      const body = getJsonBody(req);
      const tools = Array.isArray(body.tools) ? body.tools : [];
      const required = Array.isArray(body.required) ? body.required.map((x) => String(x)) : [];
      const resolutions = capabilityResolverHttp.resolveAll(tools, required);
      return send(req, res, 200, { resolutions });
    }

    if (method === "POST" && pathname === "/planner/tasks:plan") {
      if (!(await requireAuthContext(req, res))) return;
      if (!assertRequestContext(req, { requireEntitlement: false })) {
        return send(req, res, 500, { message: "context_assert_fail" });
      }
      req.identitySnapshot = buildIdentitySnapshot(req);
      identitySnapshotLog({
        event: "identity_snapshot_created",
        user_id: req.identitySnapshot.user_id,
        market: req.identitySnapshot.market,
        locale: req.identitySnapshot.locale,
        product: req.identitySnapshot.product,
        client_platform: req.identitySnapshot.client_platform,
        session_version: req.identitySnapshot.session_version
      });
      const body = getJsonBody(req);
      let result;
      try {
        result = planTasks({
          context: req.context,
          identity_snapshot: req.identitySnapshot,
          input: body
        });
      } catch (planErr) {
        if (planErr && planErr.code === "identity_snapshot_invalid") {
          return send(req, res, 500, { message: "identity_snapshot_invalid" });
        }
        throw planErr;
      }
      return send(req, res, 200, result);
    }

    if (method === "POST" && pathname === "/aics/execution/tasks") {
      if (!(await requireAuthContext(req, res))) return;
      const body = getJsonBody(req);
      const taskId = body.taskId || randomUUID();
      const task = {
        id: taskId,
        prompt: body.prompt || "",
        sourceTaskId: body.sourceTaskId || null,
        runType: body.runType || "new",
        plannerSource: body.plannerSource || "fallback",
        status: body.status || "pending",
        input: body.input || {},
        result: null,
        lastErrorSummary: null,
        createdAt: now(),
        updatedAt: now()
      };
      db.tasks.set(taskId, task);
      db.stepsByTask.set(taskId, []);
      db.logsByTask.set(taskId, []);
      return send(req, res, 201, task);
    }

    const taskIdForPatch = parseTaskId(pathname);
    if (method === "PATCH" && taskIdForPatch) {
      if (!(await requireAuthContext(req, res))) return;
      const task = db.tasks.get(taskIdForPatch);
      if (!task) return send(req, res, 404, { message: "task not found" });
      const prevStatus = task.status;
      const body = getJsonBody(req);
      task.status = body.status || task.status;
      task.result = body.result ?? task.result;
      task.lastErrorSummary = body.lastErrorSummary ?? task.lastErrorSummary;
      task.updatedAt = now();
      db.tasks.set(taskIdForPatch, task);
      try {
        historyService.recordIfExecutionBecameTerminal(req.context.userId, prevStatus, task);
      } catch (histErr) {
        console.error("[history] recordIfExecutionBecameTerminal", histErr.message || histErr);
      }
      return send(req, res, 200, task);
    }

    const stepPath = parseStepPath(pathname);
    if (method === "PUT" && stepPath) {
      if (!(await requireAuthContext(req, res))) return;
      const { taskId, stepId } = stepPath;
      if (!db.tasks.has(taskId)) return send(req, res, 404, { message: "task not found" });
      const body = getJsonBody(req);
      const steps = db.stepsByTask.get(taskId) || [];
      const next = {
        id: stepId,
        stepOrder: body.stepOrder,
        title: body.title,
        actionName: body.actionName,
        status: body.status,
        input: body.input || {},
        output: body.output || null,
        errorType: body.errorType || null,
        error: body.error || null,
        latency: body.latency || 0,
        updatedAt: now()
      };
      const idx = steps.findIndex((s) => s.id === stepId);
      if (idx >= 0) steps[idx] = next;
      else steps.push(next);
      steps.sort((a, b) => a.stepOrder - b.stepOrder);
      db.stepsByTask.set(taskId, steps);
      return send(req, res, 200, next);
    }

    const taskIdForLogs = parseLogsPath(pathname);
    if (method === "POST" && taskIdForLogs) {
      if (!(await requireAuthContext(req, res))) return;
      if (!db.tasks.has(taskIdForLogs)) return send(req, res, 404, { message: "task not found" });
      const body = getJsonBody(req);
      const logs = db.logsByTask.get(taskIdForLogs) || [];
      const log = {
        id: randomUUID(),
        taskId: taskIdForLogs,
        stepId: body.stepId || null,
        level: body.level || "info",
        status: body.status || "pending",
        input: body.input || null,
        output: body.output || null,
        errorType: body.errorType || null,
        error: body.error || null,
        latency: body.latency || 0,
        createdAt: now()
      };
      logs.push(log);
      db.logsByTask.set(taskIdForLogs, logs);
      return send(req, res, 201, log);
    }

    if (method === "GET" && pathname === "/aics/execution/tasks") {
      if (!(await requireAuthContext(req, res))) return;
      const status = parsed.searchParams.get("status");
      const tasks = Array.from(db.tasks.values());
      const filtered = status ? tasks.filter((t) => t.status === status) : tasks;
      const payload = filtered
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .map((task) => ({
          ...task,
          steps: (db.stepsByTask.get(task.id) || []).map(mapStepForClient)
        }));
      return send(req, res, 200, payload);
    }

    const lifecycle = parseLifecyclePath(pathname);
    if (method === "POST" && lifecycle) {
      if (!(await requireAuthContext(req, res))) return;
      const { taskId: lifeTaskId, action } = lifecycle;
      const task = db.tasks.get(lifeTaskId);
      if (!task) return send(req, res, 404, { message: "task not found" });
      if (action === "pause") {
        if (task.status !== "running") {
          return send(req, res, 400, { message: "task_not_active" });
        }
        const next = { ...task, status: "paused", updatedAt: now() };
        db.tasks.set(lifeTaskId, next);
        return send(req, res, 200, { id: lifeTaskId, status: next.status });
      }
      if (action === "resume") {
        if (task.status !== "paused") {
          return send(req, res, 400, { message: "task_not_paused" });
        }
        const next = { ...task, status: "running", updatedAt: now() };
        db.tasks.set(lifeTaskId, next);
        return send(req, res, 200, { id: lifeTaskId, status: next.status });
      }
      if (action === "cancel") {
        if (task.status !== "running" && task.status !== "paused") {
          return send(req, res, 400, { message: "task_not_cancellable" });
        }
        const next = { ...task, status: "cancelled", updatedAt: now() };
        db.tasks.set(lifeTaskId, next);
        return send(req, res, 200, { id: lifeTaskId, status: next.status });
      }
    }

    const taskIdForGet = parseTaskId(pathname);
    if (method === "GET" && taskIdForGet) {
      if (!(await requireAuthContext(req, res))) return;
      const task = db.tasks.get(taskIdForGet);
      if (!task) return send(req, res, 404, { message: "task not found" });
      const mappedSteps = (db.stepsByTask.get(taskIdForGet) || []).map(mapStepForClient);
      return send(req, res, 200, {
        task: { ...task, steps: mappedSteps },
        steps: mappedSteps,
        logs: db.logsByTask.get(taskIdForGet) || []
      });
    }

    const taskIdForRerun = parseRerunPath(pathname);
    if (method === "POST" && taskIdForRerun) {
      if (!(await requireAuthContext(req, res))) return;
      const sourceTask = db.tasks.get(taskIdForRerun);
      if (!sourceTask) return send(req, res, 404, { message: "source task not found" });
      const newTaskId = randomUUID();
      const copied = {
        ...sourceTask,
        id: newTaskId,
        sourceTaskId: sourceTask.id,
        runType: "rerun",
        status: "pending",
        result: null,
        lastErrorSummary: null,
        createdAt: now(),
        updatedAt: now()
      };
      db.tasks.set(newTaskId, copied);
      db.stepsByTask.set(newTaskId, []);
      db.logsByTask.set(newTaskId, [
        {
          id: randomUUID(),
          taskId: newTaskId,
          stepId: null,
          level: "info",
          status: "pending",
          input: { sourceTaskId: sourceTask.id },
          output: null,
          errorType: null,
          error: null,
          latency: 0,
          createdAt: now()
        }
      ]);
      return send(req, res, 200, { taskId: newTaskId, sourceTaskId: sourceTask.id, status: "pending" });
    }

    return send(req, res, 404, { message: "not found" });
  } catch (error) {
    return send(req, res, 500, { message: "internal error", detail: error.message || String(error) });
  }
}

module.exports = { legacyKernelHandler };
