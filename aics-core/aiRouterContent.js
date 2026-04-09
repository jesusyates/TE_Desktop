/**
 * G-1 / G-1A / G-2：AICS Core 统一 AI Router（OpenAI 兼容 /v1/chat/completions）。
 * — 多模型：AI_ROUTER_MODEL_PRIMARY（或 AI_ROUTER_MODEL）+ AI_ROUTER_MODEL_FALLBACK（逗号/分号分隔）
 * — 单次请求内主模型失败时自动尝试备用模型；成功仍为 resultSource: ai_result
 */

function getAiRouterConfig() {
  const baseUrlRaw = String(process.env.AI_ROUTER_BASE_URL || "").trim();
  const keyTrimmed = String(process.env.AI_ROUTER_API_KEY || "").trim();
  const models = resolveModelChain();
  const hasApiKey = keyTrimmed.length > 0;
  const hasBase = baseUrlRaw.length > 0 && /^https?:\/\//i.test(baseUrlRaw);
  const enabled = hasBase && hasApiKey;
  return { enabled, baseUrl: baseUrlRaw, hasApiKey, hasBase, models, model: models[0] || "gpt-4o-mini" };
}

/** G-2：主模型 + 至少一个 fallback 时 models.length >= 2 */
function resolveModelChain() {
  const primary = String(
    process.env.AI_ROUTER_MODEL_PRIMARY || process.env.AI_ROUTER_MODEL || "gpt-4o-mini"
  ).trim();
  const fbRaw = String(process.env.AI_ROUTER_MODEL_FALLBACK || "").trim();
  const fallbacks = fbRaw.length
    ? fbRaw
        .split(/[,;]/)
        .map((s) => String(s).trim())
        .filter(Boolean)
    : [];
  const seen = new Set();
  const chain = [];
  if (primary) {
    seen.add(primary);
    chain.push(primary);
  }
  for (const m of fallbacks) {
    if (seen.has(m)) continue;
    seen.add(m);
    chain.push(m);
  }
  return chain.length ? chain : ["gpt-4o-mini"];
}

function isRuntimeProduction() {
  const n = String(process.env.NODE_ENV || "").toLowerCase();
  const a = String(process.env.AICS_ENV || "").trim().toLowerCase();
  return n === "production" || a === "production";
}

/** @type {boolean} */
let prodStubWarned = false;

function allowLocalStub() {
  if (String(process.env.AICS_DISABLE_LOCAL_AI_STUB || "").trim() === "1") {
    return false;
  }
  const wantStub = String(process.env.AI_ALLOW_LOCAL_STUB || "").trim() === "1";
  if (isRuntimeProduction()) {
    if (wantStub && !prodStubWarned) {
      prodStubWarned = true;
      console.warn(
        "[aics-core aiRouterContent] AI_ALLOW_LOCAL_STUB is ignored when NODE_ENV/AICS_ENV is production — stub cannot be enabled in production."
      );
    }
    return false;
  }
  return wantStub;
}

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

function buildUserMessage(action, prompt) {
  const safe = prompt == null ? "" : String(prompt);
  const clipped = safe.length > 48000 ? `${safe.slice(0, 47999)}…` : safe;
  if (action === "summarize") {
    return [
      "你是内容工作助手。请仅根据下列材料完成摘要、压缩与结构化整理，不要编造材料中未出现的信息，不要当作全新主题扩写。",
      "",
      clipped
    ].join("\n");
  }
  return clipped;
}

function buildStubBody(action, userMessage) {
  if (!stubWarned) {
    stubWarned = true;
    console.warn(
      "[aics-core aiRouterContent] AI_ALLOW_LOCAL_STUB=1 (non-production) — returning non-model placeholder."
    );
  }
  const head = `[AI_ALLOW_LOCAL_STUB · ${action}]`;
  const core = userMessage.length > 3500 ? `${userMessage.slice(0, 3499)}…` : userMessage;
  return `${head}\n\n${core}`;
}

function fail(code, message, detail, aiOutcome) {
  return { ok: false, code, message, detail, aiOutcome };
}

/** 单次模型调用失败 → 与桌面 parseAiContentWire.aiOutcomeFromFailureCode 对齐 */
function mapAttemptCodeToAiOutcome(code) {
  switch (code) {
    case "ai_router_timeout":
      return "router_timeout";
    case "ai_router_network_error":
      return "router_request_failed";
    case "ai_router_http_error":
      return "router_upstream_error";
    case "ai_router_invalid_json":
      return "router_invalid_response";
    case "ai_router_empty_choice":
      return "router_empty_response";
    case "ai_router_read_error":
      return "router_read_error";
    default:
      return "router_upstream_error";
  }
}

/**
 * 单次模型调用：成功返回 { ok: true, text }；失败返回 { ok: false, code, message, detail }
 */
async function attemptChatCompletion(baseUrl, apiKey, model, userMessage, connectMs, responseMs) {
  const url = `${String(baseUrl).replace(/\/+$/, "")}/v1/chat/completions`;
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
        model,
        messages: [{ role: "user", content: userMessage }]
      }),
      signal: ac.signal
    });
  } catch (netErr) {
    clearTimeout(connectTimer);
    const name = netErr && netErr.name;
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    if (name === "AbortError" || /aborted/i.test(msg)) {
      return {
        ok: false,
        code: "ai_router_timeout",
        message: "AI router connect timeout",
        detail: msg
      };
    }
    return {
      ok: false,
      code: "ai_router_network_error",
      message: netErr instanceof Error ? netErr.message : String(netErr),
      detail: undefined
    };
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
      return {
        ok: false,
        code: "ai_router_timeout",
        message: "AI router response timeout",
        detail: msg
      };
    }
    return { ok: false, code: "ai_router_read_error", message: msg, detail: undefined };
  }

  if (!res.ok) {
    return {
      ok: false,
      code: "ai_router_http_error",
      message: `AI router returned ${res.status}`,
      detail: (bodyText || "").slice(0, 800)
    };
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return {
      ok: false,
      code: "ai_router_invalid_json",
      message: "AI router returned invalid JSON",
      detail: (bodyText || "").slice(0, 400)
    };
  }

  const aiText = data?.choices?.[0]?.message?.content;
  if (aiText == null || String(aiText).trim() === "") {
    return {
      ok: false,
      code: "ai_router_empty_choice",
      message: "AI router returned empty content",
      detail: JSON.stringify(data).slice(0, 400)
    };
  }

  return { ok: true, text: String(aiText) };
}

/**
 * @param {{ action: string, prompt: string, ctx: { userId?: string, clientId?: string } }} args
 */
async function runDesktopContentAi(args) {
  const actionRaw = args.action == null ? "" : String(args.action);
  const action = actionRaw === "summarize" ? "summarize" : "generate";
  const prompt = args.prompt == null ? "" : String(args.prompt).trim();
  if (!prompt) {
    return fail("ai_content_prompt_required", "prompt is required", undefined, "request_invalid");
  }

  const router = getAiRouterConfig();
  const stub = allowLocalStub();
  const userMessage = buildUserMessage(action, prompt);

  if (!router.enabled) {
    if (!stub) {
      const miss = [];
      if (!router.hasBase) miss.push("AI_ROUTER_BASE_URL (http/https URL)");
      if (!router.hasApiKey) miss.push("AI_ROUTER_API_KEY");
      return fail(
        "ai_router_required",
        `AI router is not configured. Set ${miss.join(" and ")}. In non-production only, you may set AI_ALLOW_LOCAL_STUB=1 for local stub.`,
        undefined,
        "router_not_configured"
      );
    }
    const body = buildStubBody(action, userMessage);
    return {
      ok: true,
      body,
      title: prompt.slice(0, 48) || "Stub",
      summary: "本地开发占位（未调用模型）",
      resultSource: "mock",
      aiOutcome: "local_stub"
    };
  }

  const apiKey = String(process.env.AI_ROUTER_API_KEY || "").trim();
  const { connectMs, responseMs } = getRouterTimeouts();
  const models = router.models;

  console.log(
    JSON.stringify({
      event: "aics_ai_content_request",
      action,
      userId: args.ctx?.userId ?? null,
      clientId: args.ctx?.clientId ?? null,
      modelChain: models,
      modelCount: models.length,
      timestamp: new Date().toISOString()
    })
  );

  const attemptErrors = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isFallbackAttempt = i > 0;

    console.log(
      JSON.stringify({
        event: "aics_ai_content_model_attempt",
        action,
        model,
        attemptIndex: i,
        isFallback: isFallbackAttempt,
        userId: args.ctx?.userId ?? null,
        timestamp: new Date().toISOString()
      })
    );

    const attempt = await attemptChatCompletion(
      router.baseUrl,
      apiKey,
      model,
      userMessage,
      connectMs,
      responseMs
    );

    if (attempt.ok) {
      const text = attempt.text;
      const title = prompt.slice(0, 48) || "AI 输出";
      const summary = text.replace(/\s+/g, " ").trim().slice(0, 240);
      const aiOutcome = isFallbackAttempt ? "router_fallback_success" : "router_success";

      console.log(
        JSON.stringify({
          event: "aics_ai_content_model_success",
          action,
          model,
          attemptIndex: i,
          usedFallback: isFallbackAttempt,
          aiOutcome,
          timestamp: new Date().toISOString()
        })
      );

      return {
        ok: true,
        body: text,
        title,
        summary,
        resultSource: "ai_result",
        aiOutcome
      };
    }

    attemptErrors.push({
      model,
      code: attempt.code,
      message: attempt.message,
      detail: attempt.detail != null ? String(attempt.detail).slice(0, 400) : undefined
    });
  }

  const detailJson = JSON.stringify(attemptErrors).slice(0, 1200);
  console.log(
    JSON.stringify({
      event: "aics_ai_content_model_all_failed",
      action,
      errors: attemptErrors,
      timestamp: new Date().toISOString()
    })
  );

  /* 仅单档模型：保持原错误语义；多档均失败 → router_all_failed */
  if (attemptErrors.length === 1) {
    const e = attemptErrors[0];
    return fail(
      e.code,
      e.message,
      e.detail != null ? String(e.detail) : undefined,
      mapAttemptCodeToAiOutcome(e.code)
    );
  }

  return fail(
    "ai_router_all_failed",
    "All configured models failed for this request",
    detailJson,
    "router_all_failed"
  );
}

module.exports = { runDesktopContentAi, getAiRouterConfig, allowLocalStub, isRuntimeProduction, resolveModelChain };
