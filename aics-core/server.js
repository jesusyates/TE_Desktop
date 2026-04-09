/**
 * AICS Core Backend — 轻量 HTTP 服务（含 D-7-3G /result、/memory-record）
 */
const http = require("http");
const { analyzeTaskCore } = require("./analyzeTask");
const { resolveClarificationIfNeeded } = require("./taskClarification");
const { planTaskCore, resolveAnalysisForPlan } = require("./planTask");
const { computeExecutionTrustV1, computeExecutionTrustAnalyzeOnly } = require("./executionTrust");
const { runSafetyCheckCore } = require("./safetyCheck");
const { runPermissionCheckForCapability } = require("./permissionChecker");
const { parseRequestIdentity } = require("./requestContext");
const resultQueryService = require("./services/resultQueryService");
const memoryQueryService = require("./services/memoryQueryService");
const templateQueryService = require("./services/templateQueryService");
const templateWriteService = require("./services/templateWriteService");
const usageQueryService = require("./services/usageQueryService");
const resultWriteService = require("./services/resultWriteService");
const memoryWriteService = require("./services/memoryWriteService");
const { deleteMemoryForUser } = require("./memoryStore");
const usageWriteService = require("./services/usageWriteService");
const taskIngressWriteService = require("./services/taskIngressWriteService");
const { runDesktopContentAi } = require("./aiRouterContent");
const { getSystemPolicy } = require("./systemPolicy");
const auditStore = require("./auditStore");
const { MEMORY_TYPES } = require("./schema/memorySchema");
const { sanitizeControllerDecision, alignAnalyze, alignPlan } = require("./controllerAlignment");
const { runContentIntelPreflightCore } = require("./contentIntelPreflight");
const { runAiRouter } = require("./aiRouter");

/**
 * AI Router v1：从 controllerDecision + decisionTrace 推导调度（不改 Controller/Trust 本体）。
 * client_data_safety_parsed 可为对象或 JSON 字符串；与 client_trust_auto_cloud 同时存在时以更严格为准（任一禁云则禁云）。
 * @param {Record<string, unknown>} body
 * @param {"analyze"|"plan"} route — /analyze → stage analysis；/plan → stage plan
 */
function computeRouterDecisionFromBody(body, route) {
  const stage = route === "analyze" ? "analysis" : "plan";
  const fallback = { taskType: "cloud", complexity: "medium", allowCloud: true, stage };

  const cd = body?.controllerDecision;
  if (!cd || typeof cd !== "object") {
    return runAiRouter(fallback);
  }
  const o = /** @type {Record<string, unknown>} */ (cd);
  const trace =
    o.decisionTrace && typeof o.decisionTrace === "object" && !Array.isArray(o.decisionTrace)
      ? /** @type {Record<string, unknown>} */ (o.decisionTrace)
      : {};

  let allowCloud = true;
  if (trace.client_trust_auto_cloud === "false") {
    allowCloud = false;
  }

  const parsedRaw = trace.client_data_safety_parsed;
  if (parsedRaw && typeof parsedRaw === "object" && !Array.isArray(parsedRaw)) {
    if ("allowCloud" in parsedRaw) {
      allowCloud = allowCloud && Boolean(/** @type {{ allowCloud?: boolean }} */ (parsedRaw).allowCloud);
    }
  } else if (typeof parsedRaw === "string" && parsedRaw.trim()) {
    try {
      const pj = JSON.parse(parsedRaw);
      if (pj && typeof pj === "object" && typeof pj.allowCloud === "boolean") {
        allowCloud = allowCloud && pj.allowCloud;
      }
    } catch {
      /* ignore */
    }
  }

  const classification = typeof o.classification === "string" ? o.classification : "";
  const rawTaskType = typeof o.taskType === "string" ? String(o.taskType).trim() : "";
  const taskType =
    classification === "local" || rawTaskType === "local"
      ? "local"
      : rawTaskType || "cloud";

  const validCx = new Set(["simple", "medium", "complex"]);
  const complexity = validCx.has(o.complexity) ? String(o.complexity) : "medium";

  return runAiRouter({ taskType, complexity, allowCloud, stage });
}

function hasNonemptyMemoryValue(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number" || typeof v === "boolean") return true;
  try {
    return JSON.stringify(v).length > 0;
  } catch {
    return false;
  }
}

const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 1_000_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > MAX_BODY) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(buf));
    req.on("error", reject);
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-aics-client-id, x-aics-user-id, x-aics-session-token, x-aics-auth-mode, X-Client-Platform, X-Client-Market, X-Client-Version, X-Client-Product, X-Client-Preference-Market, X-Client-Preference-Locale"
};

/** MODULE C-5：数据路由须有可归一身份（AICS_IDENTITY_DEV_FALLBACK=0 且无头/无 JWT 时拒绝）。 */
function ensureDataIdentity(res, ctx) {
  if (!ctx || !String(ctx.userId || "").trim() || !String(ctx.clientId || "").trim()) {
    json(res, 401, { success: false, message: "unauthorized" });
    return false;
  }
  return true;
}

function json(res, statusCode, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS,
    "Content-Length": Buffer.byteLength(body, "utf8")
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/system-policy") {
    json(res, 200, { success: true, policy: getSystemPolicy() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/audit-events") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const items = auditStore.listAuditEventsByUser(ctx.userId, url.searchParams.get("limit"));
    json(res, 200, { success: true, items });
    return;
  }

  if (req.method === "POST" && url.pathname === "/audit-event") {
    try {
      const ctx = parseRequestIdentity(req);
      if (!ensureDataIdentity(res, ctx)) return;
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const runId = typeof body.runId === "string" ? body.runId.trim() : "";
      if (!runId) {
        json(res, 400, { success: false, message: "runId is required" });
        return;
      }
      const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "";
      if (!eventType) {
        json(res, 400, { success: false, message: "eventType is required" });
        return;
      }
      const taskIdRaw = body.taskId;
      auditStore.appendAuditEvent({
        userId: ctx.userId,
        clientId: ctx.clientId,
        sessionToken: ctx.sessionToken ?? "",
        runId,
        ...(typeof taskIdRaw === "string" && taskIdRaw.trim() ? { taskId: taskIdRaw.trim() } : {}),
        eventType,
        ...(body.decision != null && body.decision !== ""
          ? { decision: String(body.decision) }
          : {}),
        ...(body.level != null && body.level !== "" ? { level: String(body.level) } : {}),
        ...(typeof body.reason === "string" && body.reason.trim() ? { reason: body.reason.trim() } : {})
      });
      json(res, 200, { success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    if (process.env.AICS_DEBUG_IDENTITY === "1") {
      try {
        const id = parseRequestIdentity(req);
        console.log(
          JSON.stringify({
            event: "aics_core_health_identity",
            userId: id.userId,
            clientId: id.clientId,
            identitySource: id.identitySource,
            isFallbackIdentity: id.isFallbackIdentity,
            clientAuthMode: id.clientAuthMode ?? null
          })
        );
      } catch {
        /* ignore */
      }
    }
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/results/") && url.pathname.length > "/results/".length) {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const runId = decodeURIComponent(url.pathname.slice("/results/".length));
    const item = resultQueryService.getResultByRunIdForUser(runId, ctx.userId);
    if (!item) {
      json(res, 404, { success: false, message: "not found" });
      return;
    }
    json(res, 200, { success: true, item });
    return;
  }

  if (req.method === "GET" && url.pathname === "/results") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const items = resultQueryService.listResults(ctx.userId, url.searchParams.get("limit"));
    json(res, 200, { success: true, items });
    return;
  }

  if (req.method === "GET" && url.pathname === "/memory-records/snapshot") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const items = memoryQueryService.snapshot(ctx.userId, url.searchParams.get("limit"));
    json(res, 200, { success: true, items });
    return;
  }

  if (req.method === "GET" && url.pathname === "/memory/list") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const data = memoryQueryService.listMemoryFormal(ctx.userId, url.searchParams);
    json(res, 200, { success: true, data: { list: data.list, total: data.total } });
    return;
  }

  if (req.method === "GET" && url.pathname === "/templates/list") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const data = templateQueryService.listTemplatesFormal(ctx.userId, url.searchParams);
    json(res, 200, { success: true, data: { list: data.list, total: data.total } });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/templates/") && url.pathname !== "/templates/list") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const rawId = url.pathname.slice("/templates/".length);
    const templateId = decodeURIComponent(rawId || "").trim();
    if (!templateId || templateId.includes("/")) {
      json(res, 400, { success: false, message: "invalid template id" });
      return;
    }
    try {
      templateWriteService.deleteUserTemplate(ctx.userId, templateId);
      json(res, 200, { success: true });
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
      const msg = e instanceof Error ? e.message : "delete failed";
      const status =
        code === "not_found" ? 404 : code === "forbidden" || code === "unauthorized" ? 403 : 400;
      json(res, status, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/templates/") && url.pathname !== "/templates/list") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const rawId = url.pathname.slice("/templates/".length);
    const templateId = decodeURIComponent(rawId || "").trim();
    if (!templateId || templateId.includes("/")) {
      json(res, 400, { success: false, message: "invalid template id" });
      return;
    }
    const detail = templateQueryService.getTemplateDetailForUser(ctx.userId, templateId);
    if (!detail) {
      json(res, 404, { success: false, message: "not found" });
      return;
    }
    json(res, 200, { success: true, data: detail });
    return;
  }

  if (req.method === "POST" && url.pathname === "/templates/save") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const out = templateWriteService.saveUserTemplate(ctx.userId, body);
      json(res, 200, { success: true, data: out });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      const status = msg === "unauthorized" ? 401 : 400;
      json(res, status, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/memory/") && url.pathname !== "/memory/list") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const rawId = url.pathname.slice("/memory/".length);
    const memoryId = decodeURIComponent(rawId || "").trim();
    if (!memoryId || memoryId.includes("/")) {
      json(res, 400, { success: false, message: "invalid memory id" });
      return;
    }
    const out = deleteMemoryForUser(ctx.userId, memoryId);
    if (!out.ok) {
      const st = out.message === "not found" ? 404 : 400;
      json(res, st, { success: false, message: out.message || "delete failed" });
      return;
    }
    json(res, 200, { success: true });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/memory/") && url.pathname !== "/memory/list") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const rawId = url.pathname.slice("/memory/".length);
    const memoryId = decodeURIComponent(rawId || "").trim();
    if (!memoryId || memoryId.includes("/")) {
      json(res, 400, { success: false, message: "invalid memory id" });
      return;
    }
    const detail = memoryQueryService.getMemoryDetailForUser(ctx.userId, memoryId);
    if (!detail) {
      json(res, 404, { success: false, message: "not found" });
      return;
    }
    json(res, 200, { success: true, data: detail });
    return;
  }

  if (req.method === "GET" && url.pathname === "/memory-records") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const items = memoryQueryService.listRecords(ctx.userId, url.searchParams.get("limit"));
    json(res, 200, { success: true, items });
    return;
  }

  if (req.method === "GET" && url.pathname === "/usage") {
    const ctx = parseRequestIdentity(req);
    if (!ensureDataIdentity(res, ctx)) return;
    const items = usageQueryService.listUsage(ctx.userId, url.searchParams.get("limit"));
    json(res, 200, { success: true, items });
    return;
  }

  if (req.method === "POST" && url.pathname === "/analyze") {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        json(res, 400, { success: false, message: "prompt is required" });
        return;
      }
      const analysis = analyzeTaskCore(body);
      const cdAnalyze = sanitizeControllerDecision(body.controllerDecision);
      const clar = resolveClarificationIfNeeded(body, analysis);
      if (clar) {
        const trustClar = computeExecutionTrustAnalyzeOnly(body.memoryHints);
        const routerDecision = computeRouterDecisionFromBody(body, "analyze");
        json(res, 200, {
          success: true,
          requireClarification: true,
          questions: clar.questions,
          analysis: { ...analysis, shouldExecute: false },
          trust: trustClar,
          controllerAlignment: { analyze: alignAnalyze(cdAnalyze, { ...analysis, shouldExecute: false }) },
          routerDecision
        });
        return;
      }
      const trust = computeExecutionTrustAnalyzeOnly(body.memoryHints);
      const routerDecision = computeRouterDecisionFromBody(body, "analyze");
      json(res, 200, {
        success: true,
        analysis,
        trust,
        controllerAlignment: { analyze: alignAnalyze(cdAnalyze, analysis) },
        routerDecision
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/plan") {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const analysis = resolveAnalysisForPlan(body);
      if (!analysis) {
        json(res, 400, {
          success: false,
          message: "prompt is required when analysis is missing or invalid"
        });
        return;
      }
      const plan = planTaskCore(analysis);
      const trust = computeExecutionTrustV1(plan, body.memoryHints);
      const cdPlan = sanitizeControllerDecision(body.controllerDecision);
      const routerDecision = computeRouterDecisionFromBody(body, "plan");
      json(res, 200, {
        success: true,
        analysis,
        plan,
        trust,
        controllerAlignment: {
          analyze: alignAnalyze(cdPlan, analysis),
          plan: alignPlan(cdPlan, plan)
        },
        routerDecision
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/content-intelligence/preflight") {
    try {
      const ctx = parseRequestIdentity(req);
      if (!ensureDataIdentity(res, ctx)) return;
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        json(res, 400, { success: false, message: "prompt is required" });
        return;
      }
      const rawItems = Array.isArray(body.historyItems) ? body.historyItems : [];
      /** @type {Array<{ historyId: string; prompt: string; preview?: string; status: string }>} */
      const historyItems = [];
      for (const it of rawItems.slice(0, 80)) {
        if (!it || typeof it !== "object") continue;
        const historyId = typeof it.historyId === "string" ? it.historyId.trim() : "";
        const pr = typeof it.prompt === "string" ? it.prompt : "";
        if (!historyId || !pr) continue;
        historyItems.push({
          historyId,
          prompt: pr.slice(0, 4000),
          preview: typeof it.preview === "string" ? it.preview.slice(0, 4000) : "",
          status: typeof it.status === "string" ? it.status.slice(0, 32) : "success"
        });
      }
      const trace = runContentIntelPreflightCore(prompt, historyItems);
      auditStore.appendAuditEvent({
        userId: ctx.userId,
        clientId: ctx.clientId,
        eventType: "content_intelligence_preflight",
        orchestrationId: trace.orchestrationId,
        promptLen: prompt.length,
        historyItemCount: historyItems.length
      });
      json(res, 200, { success: true, trace, source: "aics-core" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/safety-check") {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        json(res, 400, { success: false, message: "prompt is required" });
        return;
      }
      const safety = runSafetyCheckCore(body);
      json(res, 200, { success: true, safety });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/permission-check") {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const permission = runPermissionCheckForCapability(body);
      json(res, 200, { success: true, permission });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/result") {
    try {
      const ctx = parseRequestIdentity(req);
      if (!ensureDataIdentity(res, ctx)) return;
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        json(res, 400, { success: false, message: "prompt is required" });
        return;
      }
      if (body.result == null || typeof body.result !== "object") {
        json(res, 400, { success: false, message: "result is required" });
        return;
      }
      resultWriteService.persistValidatedResult(ctx, body);
      usageWriteService.scheduleAppendUsageFromResult(body, ctx);
      json(res, 200, { success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/memory-record") {
    try {
      const ctx = parseRequestIdentity(req);
      if (!ensureDataIdentity(res, ctx)) return;
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      const memT = typeof body.memoryType === "string" ? body.memoryType.trim() : "";
      const typedOk =
        MEMORY_TYPES.has(memT) &&
        typeof body.key === "string" &&
        body.key.trim() &&
        hasNonemptyMemoryValue(body.value);
      if (!prompt && !typedOk) {
        json(res, 400, { success: false, message: "prompt_or_typed_memory_required" });
        return;
      }
      memoryWriteService.persistMemoryRecord(ctx, body);
      json(res, 200, { success: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, { success: false, message: msg });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/ai/content") {
    try {
      const ctx = parseRequestIdentity(req);
      if (!ensureDataIdentity(res, ctx)) return;
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const act = typeof body.action === "string" ? body.action.trim() : "";
      if (act !== "generate" && act !== "summarize") {
        json(res, 400, {
          success: false,
          code: "invalid_action",
          message: "action must be generate or summarize",
          aiOutcome: "request_invalid"
        });
        return;
      }
      const prompt = typeof body.prompt === "string" ? body.prompt : "";
      if (!String(prompt).trim()) {
        json(res, 400, {
          success: false,
          code: "prompt_required",
          message: "prompt is required",
          aiOutcome: "request_invalid"
        });
        return;
      }
      const out = await runDesktopContentAi({ action: act, prompt, ctx });
      if (!out.ok) {
        json(res, 200, {
          success: false,
          code: out.code,
          message: out.message,
          aiOutcome: out.aiOutcome,
          ...(out.detail ? { detail: out.detail } : {})
        });
        return;
      }
      json(res, 200, {
        success: true,
        body: out.body,
        title: out.title,
        summary: out.summary,
        resultSource: out.resultSource,
        aiOutcome: out.aiOutcome
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, {
        success: false,
        code: "ai_content_bad_request",
        message: msg,
        aiOutcome: "request_invalid"
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/task") {
    try {
      const ctx = parseRequestIdentity(req);
      if (!ensureDataIdentity(res, ctx)) return;
      const raw = await readBody(req);
      let body = {};
      if (raw && String(raw).trim()) {
        try {
          body = JSON.parse(raw);
        } catch {
          /* 非 JSON 仍记录 ingress，prompt 置空 */
        }
      }
      taskIngressWriteService.recordIngress(ctx, body && typeof body === "object" ? body : {});
      json(res, 200, { success: true, message: "任务已接收" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid request";
      json(res, 400, { success: false, message: msg });
    }
    return;
  }

  json(res, 404, { success: false, message: "not found" });
});

server.listen(PORT, () => {
  console.log(`aics-core listening on http://0.0.0.0:${PORT}`);
});
