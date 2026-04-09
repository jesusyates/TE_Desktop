const { logger } = require("../infra/logger");

function requestLoggingMiddleware(req, res, next) {
  const start = Date.now();
  const route = req.originalUrl || req.url || "";
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const ctx = req.context || {};
    logger.info({
      event: "http_request",
      route,
      requestId: ctx.requestId || null,
      userId: ctx.userId ?? null,
      durationMs,
      error: null
    });
  });
  next();
}

module.exports = { requestLoggingMiddleware };
