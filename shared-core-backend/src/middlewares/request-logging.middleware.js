const { logger } = require("../infra/logger");

const SENSITIVE_HDR = new Set(
  "authorization cookie set-cookie x-api-key".split(" ").map((s) => s.toLowerCase())
);

function safeHeaderSnapshot(req) {
  const raw = req.headers || {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of Object.keys(raw)) {
    const lk = k.toLowerCase();
    if (SENSITIVE_HDR.has(lk)) {
      out[k] = "[redacted]";
      continue;
    }
    const v = raw[k];
    out[k] = Array.isArray(v) ? v.join(",") : v == null ? "" : String(v);
  }
  return out;
}

function requestLoggingMiddleware(req, res, next) {
  const start = Date.now();
  const route = req.originalUrl || req.url || "";
  const method = (req.method || "GET").toUpperCase();
  const origin = req.get ? req.get("origin") : req.headers.origin;
  const ctxEarly = req.context || {};

  logger.info({
    event: "http_request_start",
    method,
    path: route,
    origin: origin || null,
    requestId: ctxEarly.requestId || null,
    headers: safeHeaderSnapshot(req)
  });

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const ctx = req.context || {};
    const status = res.statusCode;
    const matched =
      req.route && typeof req.route.path === "string"
        ? `${req.baseUrl || ""}${req.route.path}`
        : null;
    logger.info({
      event: "http_request",
      method,
      path: route,
      origin: origin || null,
      requestId: ctx.requestId || null,
      userId: ctx.userId ?? null,
      durationMs,
      status,
      matchedRoute: matched,
      error: null
    });
  });
  next();
}

module.exports = { requestLoggingMiddleware };
