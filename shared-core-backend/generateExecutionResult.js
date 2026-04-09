/**
 * AI 统一入口（Shared Core）。模块 C 硬规则：
 * - 未配置 AI_ROUTER_BASE_URL + AI_ROUTER_API_KEY → 抛 ai_router_required（由 runTask → 503）
 * - 请求/解析/空内容 → 抛对应 AiGenerationError，禁止静默 fallback
 * - 仅当 AI_ALLOW_LOCAL_STUB=1 时允许本地占位，且内容必须以 [AI_ALLOW_LOCAL_STUB · …] 开头以便审计
 */
const { assertIdentitySnapshot } = require("./context/identity-snapshot.util");

function getAiRouterConfig() {
  const baseUrlRaw = String(process.env.AI_ROUTER_BASE_URL || "").trim();
  const keyTrimmed = String(process.env.AI_ROUTER_API_KEY || "").trim();
  const model = String(process.env.AI_ROUTER_MODEL || "gpt-4o-mini").trim();
  const hasApiKey = keyTrimmed.length > 0;
  const hasBase =
    baseUrlRaw.length > 0 &&
    /^https?:\/\//i.test(baseUrlRaw);
  const enabled = hasBase && hasApiKey;
  return { enabled, baseUrl: baseUrlRaw, hasApiKey, hasBase, model };
}

function allowLocalStub() {
  return String(process.env.AI_ALLOW_LOCAL_STUB || "").trim() === "1";
}

/**
 * @param {string} name
 * @param {number} fallback
 */
function parseTimeoutMs(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getRouterTimeouts() {
  const responseMs = parseTimeoutMs(
    "AI_ROUTER_RESPONSE_TIMEOUT_MS",
    parseTimeoutMs("AI_ROUTER_TIMEOUT_MS", 60000)
  );
  const connectMs = parseTimeoutMs("AI_ROUTER_CONNECT_TIMEOUT_MS", 30000);
  return { connectMs, responseMs };
}

/**
 * @param {string} event
 * @param {string} baseUrl
 * @param {string} model
 * @param {number} connectMs
 * @param {number} responseMs
 * @param {unknown} task_id
 * @param {string} stepTitle
 * @param {string} [phase]
 */
function logAiRouterDiag(event, baseUrl, model, connectMs, responseMs, task_id, stepTitle, phase) {
  const payload = {
    event,
    provider_base_url: baseUrl.replace(/\/+$/, ""),
    model,
    timeout_ms: responseMs,
    connect_timeout_ms: connectMs,
    task_id: task_id != null ? task_id : undefined,
    stepTitle,
    timestamp: new Date().toISOString()
  };
  if (phase) payload.phase = phase;
  console.log(JSON.stringify(payload));
}

/**
 * @param {Promise<string>} promise
 * @param {number} ms
 */
function readTextWithTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => {
      setTimeout(() => {
        const err = new Error(`response timeout after ${ms}ms`);
        err.name = "AbortError";
        rej(err);
      }, ms);
    })
  ]);
}

/** @type {boolean} */
let stubWarned = false;

function logAiStep(identity_snapshot, requestContext, detail) {
  console.log(
    JSON.stringify({
      event: "ai_generate_step",
      task_id: detail.task_id != null ? detail.task_id : undefined,
      user_id: identity_snapshot.user_id,
      market: identity_snapshot.market,
      locale: identity_snapshot.locale,
      product: identity_snapshot.product,
      client_platform: identity_snapshot.client_platform,
      session_version: identity_snapshot.session_version,
      timestamp: new Date().toISOString(),
      source: "shared-core-ai",
      ...detail
    })
  );
}

function buildLocalStubStepResult(prompt, stepTitle, priorOutput) {
  if (!stubWarned) {
    stubWarned = true;
    console.warn(
      "[shared-core-ai] AI_ALLOW_LOCAL_STUB=1 — returning non-model placeholder content (not valid for production acceptance)."
    );
  }
  const safeT = stepTitle == null ? "" : String(stepTitle);
  const safeP = prompt == null ? "" : String(prompt);
  const ctxLine =
    priorOutput == null || String(priorOutput).trim() === "" ? "（无）" : String(priorOutput);
  const composed = `${safeT}\n任务：${safeP}\n上一步结果：${ctxLine}`;
  const content = `[AI_ALLOW_LOCAL_STUB · ${safeT}]\n${composed}`;
  return {
    title: safeP.slice(0, 20) || "未命名主题",
    content,
    _source: "dev_local_stub"
  };
}

class AiGenerationError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {string} [detail]
   */
  constructor(code, message, detail) {
    super(message);
    this.name = "AiGenerationError";
    this.code = code;
    this.detail = detail;
  }
}

function logRouterBootOnce() {
  if (logRouterBootOnce._done) return;
  logRouterBootOnce._done = true;
  const r = getAiRouterConfig();
  console.log(
    JSON.stringify({
      event: "ai_router_config",
      router_enabled: r.enabled,
      model: r.enabled ? r.model : null,
      ai_allow_local_stub: allowLocalStub()
    })
  );
}
logRouterBootOnce._done = false;

async function generateStepResult({
  stepTitle,
  prompt,
  executionContext,
  requestContext,
  identity_snapshot,
  task_id,
  prompt_context
}) {
  logRouterBootOnce();

  const assert = assertIdentitySnapshot(identity_snapshot, {
    allowNullEntitlement: false,
    task_id
  });
  if (!assert.ok) {
    throw new Error("identity_snapshot_invalid");
  }

  const router = getAiRouterConfig();
  const safePrior = executionContext == null ? "" : String(executionContext);
  const safePrompt = prompt == null ? "" : String(prompt);
  const safeStepTitle = stepTitle == null ? "" : String(stepTitle);
  const ctxLine = safePrior.trim() === "" ? "（无）" : safePrior;
  const composed = `${safeStepTitle}\n任务：${safePrompt}\n上一步结果：${ctxLine}`;

  const stubAllowed = allowLocalStub();

  logAiStep(identity_snapshot, requestContext, {
    mode: router.enabled ? "router" : stubAllowed ? "local_stub_allowed" : "disabled",
    stepTitle: safeStepTitle,
    task_id,
    model: router.enabled ? router.model : undefined
  });

  if (!router.enabled) {
    if (stubAllowed) {
      return buildLocalStubStepResult(safePrompt, safeStepTitle, safePrior);
    }
    const miss = [];
    if (!router.hasBase) miss.push("AI_ROUTER_BASE_URL (must be http/https URL)");
    if (!router.hasApiKey) miss.push("AI_ROUTER_API_KEY");
    throw new AiGenerationError(
      "ai_router_required",
      "AI router is not configured",
      `Set ${miss.join(" and ")}. Do not set AI_ALLOW_LOCAL_STUB except local dev.`
    );
  }

  if (stubAllowed) {
    console.warn(
      "[shared-core-ai] AI_ALLOW_LOCAL_STUB=1 is set but AI_ROUTER is also configured; real router will be used."
    );
  }

  const apiKey = String(process.env.AI_ROUTER_API_KEY || "").trim();
  const url = `${router.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
  const { connectMs, responseMs } = getRouterTimeouts();
  const baseForLog = router.baseUrl.replace(/\/+$/, "");
  void prompt_context;

  logAiRouterDiag(
    "ai_router_request",
    baseForLog,
    router.model,
    connectMs,
    responseMs,
    task_id,
    safeStepTitle
  );

  const ac = new AbortController();
  const connectTimer = setTimeout(() => ac.abort(), connectMs);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: router.model,
        messages: [{ role: "user", content: composed }]
      }),
      signal: ac.signal
    });
  } catch (netErr) {
    clearTimeout(connectTimer);
    const name = netErr && netErr.name;
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    if (name === "AbortError" || /aborted/i.test(msg)) {
      logAiRouterDiag(
        "ai_router_timeout",
        baseForLog,
        router.model,
        connectMs,
        responseMs,
        task_id,
        safeStepTitle,
        "connect"
      );
      throw new AiGenerationError("ai_router_timeout", "AI router timeout", `connect: ${msg}`);
    }
    throw new AiGenerationError(
      "ai_router_network_error",
      "AI router request failed",
      netErr instanceof Error ? netErr.message : String(netErr)
    );
  } finally {
    clearTimeout(connectTimer);
  }

  let bodyText;
  try {
    bodyText = await readTextWithTimeout(res.text(), responseMs);
  } catch (readErr) {
    const name = readErr && readErr.name;
    const msg = readErr instanceof Error ? readErr.message : String(readErr);
    if (name === "AbortError" || /timeout/i.test(msg)) {
      logAiRouterDiag(
        "ai_router_timeout",
        baseForLog,
        router.model,
        connectMs,
        responseMs,
        task_id,
        safeStepTitle,
        "response"
      );
      throw new AiGenerationError("ai_router_timeout", "AI router timeout", msg);
    }
    throw readErr;
  }

  if (!res.ok) {
    throw new AiGenerationError(
      "ai_router_http_error",
      `AI router returned ${res.status}`,
      bodyText.slice(0, 800)
    );
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new AiGenerationError("ai_router_invalid_json", "AI router returned invalid JSON", bodyText.slice(0, 400));
  }

  const aiText = data?.choices?.[0]?.message?.content;
  if (aiText == null || String(aiText).trim() === "") {
    throw new AiGenerationError(
      "ai_router_empty_choice",
      "AI router returned empty content",
      JSON.stringify(data).slice(0, 400)
    );
  }

  return {
    title: safePrompt.slice(0, 20) || "未命名主题",
    content: String(aiText),
    _source: "ai_router"
  };
}

module.exports = { generateStepResult, getAiRouterConfig, AiGenerationError, allowLocalStub };
