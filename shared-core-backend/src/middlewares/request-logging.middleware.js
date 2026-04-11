const { logger } = require("../infra/logger");

const SENSITIVE_BODY_RE = /bearer\s+[\w\-._~+/=]+|api[_-]?key["\s:]+[^"\s,}]+|token["\s:]+[^"\s,}]+/gi;

function safeBodyPreview(body, max = 500) {
  if (body == null || body === "") return null;
  try {
    const s = typeof body === "string" ? body : JSON.stringify(body);
    let out = s.length > max ? `${s.slice(0, max)}…` : s;
    out = out.replace(SENSITIVE_BODY_RE, "[redacted]");
    out = out.replace(/\\\\Users\\\\[^\\]+/g, "[redacted_path]");
    out = out.replace(/\/Users\/[^/\s]+/gi, "[redacted_path]");
    return out;
  } catch {
    return "[unserializable]";
  }
}

function clientContextSnapshot(req) {
  const get = (k) => (req.get ? req.get(k) : req.headers[k.toLowerCase()]) || null;
  return {
    platform: get("x-client-platform"),
    market: get("x-client-market"),
    locale: get("x-client-locale"),
    product: get("x-client-product") || get("x-product"),
    version: get("x-client-version")
  };
}

function requestLoggingMiddleware(req, res, next) {
  const start = Date.now();
  const route = req.originalUrl || req.url || "";
  const method = (req.method || "GET").toUpperCase();
  const ctxEarly = req.context || {};

  logger.info({
    event: "request_received",
    requestId: ctxEarly.requestId || null,
    userId: ctxEarly.userId ?? null,
    route,
    method,
    status: "received",
    durationMs: 0,
    errorCode: null,
    bodyPreview: req.body && Object.keys(req.body).length ? safeBodyPreview(req.body) : null,
    client: clientContextSnapshot(req)
  });

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const ctx = req.context || {};
    const statusCode = res.statusCode;
    const success = statusCode < 400;
    const errorCode =
      (res.locals && res.locals.aicsErrorCode) ||
      (success ? null : statusCode === 429 ? "RATE_LIMITED" : `HTTP_${statusCode}`);
    const payload = {
      event: success ? "request_completed" : "request_failed",
      requestId: ctx.requestId || null,
      userId: ctx.userId ?? null,
      route,
      method,
      durationMs,
      status: success ? "success" : "failure",
      statusCode,
      errorCode: success ? null : errorCode
    };
    if (success) {
      logger.info(payload);
    } else {
      logger.warn(payload);
    }
  });
  next();
}

module.exports = { requestLoggingMiddleware, safeBodyPreview };
