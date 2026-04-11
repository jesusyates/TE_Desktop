/**
 * Auth 注册/上游失败：结构化诊断（日志可观测）；禁止写入 token/password。
 */
const { config } = require("../src/infra/config");

const REDACT_KEYS =
  /^(password|passwd|pwd|secret|token|apikey|api[_-]?key|authorization|refresh[_-]?token|service[_-]?role|access_token|refresh_token)$/i;

function maskEmail(emailNorm) {
  if (emailNorm == null || typeof emailNorm !== "string") return "";
  const s = String(emailNorm).trim().toLowerCase();
  const atIx = s.indexOf("@");
  if (atIx < 0) return "**";
  const local = s.slice(0, atIx);
  const domain = s.slice(atIx + 1);
  const prefix = local.length <= 2 ? local : local.slice(0, 2);
  return `${prefix}***@${domain}`;
}

function sanitizeForLog(value, depth = 0) {
  if (depth > 6) return "[max_depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > 2000 ? `${value.slice(0, 2000)}...(truncated)` : value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((x) => sanitizeForLog(x, depth + 1));
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (REDACT_KEYS.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "object" && v != null) {
      out[k] = sanitizeForLog(v, depth + 1);
    } else if (typeof v === "string" && v.length > 800) {
      out[k] = `${v.slice(0, 800)}...(truncated)`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function flattenOneCause(e) {
  if (e instanceof Error) {
    const o = {
      errorName: e.name,
      errorMessage: e.message,
      stack: e.stack ? e.stack.slice(0, 3000) : undefined
    };
    if (typeof e.status === "number" || typeof e.status === "string") {
      o.upstreamStatus = e.status;
    }
    if (e.code != null) {
      o.upstreamCode = String(e.code);
    }
    return sanitizeForLog(o);
  }
  if (e && typeof e === "object") {
    return sanitizeForLog(e);
  }
  return { errorMessage: String(e).slice(0, 500) };
}

function expandErrorCauses(err) {
  if (!err) return undefined;
  const chain = [];
  let cur = err.cause;
  for (let i = 0; i < 8 && cur != null; i += 1) {
    chain.push(flattenOneCause(cur));
    cur = cur.cause;
  }
  return chain.length ? chain : undefined;
}

/**
 * @param {object} p
 * @param {import("express").Request} [p.req]
 * @param {{ client_platform?: string|null, product?: string|null }} [p.meta]
 * @param {string} [p.emailNorm]
 * @param {string} [p.upstreamAction]
 * @param {Error|null} [p.err]
 * @param {object|null} [p.errorDetail] upstream 归一化片段（如 adminCreateUser 返回）
 * @param {string|null} [p.plainErrorMessage]
 * @param {unknown} [p.responseBodyExtra]
 */
function buildRegisterFailedPayload(p) {
  const req = p.req;
  const meta = p.meta || {};
  const emailNorm = p.emailNorm;
  const upstreamAction = p.upstreamAction || "unknown";
  const err = p.err;
  const errorDetail = p.errorDetail;
  let plainErrorMessage = p.plainErrorMessage != null ? String(p.plainErrorMessage) : "";

  const requestId = (req && req.context && req.context.requestId) || "";
  const authProvider = config().authProvider;

  let errorMessage = plainErrorMessage;
  let errorName = "";
  let stack = "";
  if (err instanceof Error) {
    errorMessage = err.message || errorMessage;
    errorName = err.name || "";
    stack = err.stack || "";
  }

  let upstreamStatus = null;
  let upstreamCode = null;
  let upstreamMessage = null;
  if (errorDetail && typeof errorDetail === "object") {
    if (errorDetail.upstreamStatus != null) upstreamStatus = errorDetail.upstreamStatus;
    if (errorDetail.upstreamCode != null) upstreamCode = String(errorDetail.upstreamCode);
    if (errorDetail.upstreamMessage != null) upstreamMessage = String(errorDetail.upstreamMessage);
  }

  const responseBody =
    p.responseBodyExtra != null
      ? sanitizeForLog(p.responseBodyExtra)
      : errorDetail && errorDetail.responseBody != null
        ? sanitizeForLog(errorDetail.responseBody)
        : null;

  if (!errorMessage && upstreamMessage) errorMessage = upstreamMessage;
  if (!upstreamMessage && errorMessage) upstreamMessage = errorMessage;

  return {
    event: "register_failed",
    user_id: null,
    jti: null,
    client_platform: meta.client_platform != null ? meta.client_platform : null,
    product: meta.product != null ? meta.product : null,
    requestId,
    authProvider,
    upstreamAction,
    upstreamStatus,
    upstreamCode,
    upstreamMessage,
    errorMessage: errorMessage || "register_failed",
    errorName: errorName || null,
    stack: stack || null,
    responseBody,
    emailMasked: maskEmail(emailNorm || ""),
    errorCause: expandErrorCauses(err)
  };
}

/** 供非生产 HTTP 响应附带的脱敏上游摘要（具体策略见 v1-http）。 */
function pickDevUpstreamBody(errorDetail, err) {
  let upstreamCode = null;
  let upstreamMessage = null;
  if (errorDetail && typeof errorDetail === "object") {
    if (errorDetail.upstreamCode != null) upstreamCode = String(errorDetail.upstreamCode);
    if (errorDetail.upstreamMessage != null) {
      upstreamMessage = String(errorDetail.upstreamMessage).slice(0, 500);
    }
  }
  if (err instanceof Error) {
    if (!upstreamMessage && err.message) upstreamMessage = String(err.message).slice(0, 500);
    if (!upstreamCode && err.code != null) upstreamCode = String(err.code);
  }
  const o = {};
  if (upstreamCode) o.upstreamCode = upstreamCode;
  if (upstreamMessage) o.upstreamMessage = upstreamMessage;
  return o;
}

/**
 * 通用上游事件日志（resend / 其他 auth 诊断）；与 auth.log.js 白名单字段对齐。
 * @param {string} event
 * @param {object} p
 */
function buildUpstreamAuthEventPayload(event, p) {
  const req = p.req;
  const meta = p.meta || {};
  const emailNorm = p.emailNorm;
  const upstreamAction = p.upstreamAction || "unknown";
  const requestId = (req && req.context && req.context.requestId) || "";
  const authProvider = config().authProvider;
  const supabaseError = p.supabaseError;

  let upstreamStatus = null;
  let upstreamCode = null;
  let upstreamMessage = null;
  let responseBody = null;
  if (supabaseError && typeof supabaseError === "object") {
    upstreamStatus = supabaseError.status != null ? supabaseError.status : null;
    upstreamCode =
      supabaseError.code != null
        ? String(supabaseError.code)
        : supabaseError.name != null
          ? String(supabaseError.name)
          : null;
    upstreamMessage = supabaseError.message != null ? String(supabaseError.message) : null;
    responseBody = sanitizeForLog({
      status: supabaseError.status,
      code: supabaseError.code,
      name: supabaseError.name,
      message: supabaseError.message
    });
  }
  if (p.extraResponseBody != null) {
    responseBody = sanitizeForLog(p.extraResponseBody);
  }

  return {
    event,
    user_id: null,
    jti: null,
    client_platform: meta.client_platform != null ? meta.client_platform : null,
    product: meta.product != null ? meta.product : null,
    requestId,
    authProvider,
    upstreamAction,
    upstreamStatus,
    upstreamCode,
    upstreamMessage,
    errorMessage: p.errorMessage != null ? String(p.errorMessage) : upstreamMessage,
    errorName: p.errorName != null ? String(p.errorName) : null,
    stack: p.stack != null ? String(p.stack).slice(0, 4000) : null,
    responseBody,
    emailMasked: maskEmail(emailNorm || ""),
    errorCause: p.err ? expandErrorCauses(p.err instanceof Error ? p.err : new Error(String(p.err))) : undefined
  };
}

module.exports = {
  maskEmail,
  sanitizeForLog,
  buildRegisterFailedPayload,
  pickDevUpstreamBody,
  buildUpstreamAuthEventPayload
};
