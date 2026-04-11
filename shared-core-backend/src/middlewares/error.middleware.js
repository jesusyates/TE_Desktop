const { logger } = require("../infra/logger");
const { config } = require("../infra/config");
const { AppError } = require("../utils/AppError");

function pickRequestId(req) {
  return (req.context && req.context.requestId) || "";
}

function errorMiddleware(err, req, res, _next) {
  const requestId = pickRequestId(req);
  const c = config();
  const isProd = c.nodeEnv === "production";

  if (err && err.type === "entity.parse.failed") {
    res.locals.aicsErrorCode = "INVALID_BODY";
    logger.warn({ event: "body_parse_error", requestId, route: req.originalUrl, error: err.message });
    return res.status(400).json({
      success: false,
      code: "INVALID_BODY",
      message: "Request body could not be parsed",
      requestId
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    res.locals.aicsErrorCode = "INVALID_JSON";
    logger.warn({ event: "invalid_json", requestId, route: req.originalUrl, error: err.message });
    return res.status(400).json({
      success: false,
      code: "INVALID_JSON",
      message: "Invalid JSON body",
      requestId
    });
  }

  if (err && err.message === "Not allowed by CORS") {
    res.locals.aicsErrorCode = "CORS_BLOCKED";
    const origin = req.headers && req.headers.origin;
    logger.warn({
      event: "cors_blocked",
      requestId,
      route: req.originalUrl,
      method: req.method,
      origin: origin || null,
      error: err.message
    });
    /** 回显请求 Origin（含字符串 "null"），便于桌面端读到 403 JSON，而非 ERR_NETWORK */
    if (typeof origin === "string" && origin.length > 0) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    }
    return res.status(403).json({
      success: false,
      code: "CORS_BLOCKED",
      message: "Origin not allowed",
      requestId
    });
  }

  if (err instanceof AppError) {
    res.locals.aicsErrorCode = err.code;
    const ctx = req.context || {};
    logger.warn({
      event: "app_error",
      requestId,
      userId: ctx.userId ?? null,
      route: req.originalUrl,
      method: (req.method || "GET").toUpperCase(),
      platform: ctx.platform ?? null,
      market: ctx.market ?? null,
      locale: ctx.locale ?? null,
      error: err.message,
      code: err.code,
      errorCode: err.code,
      result: "failure"
    });
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      requestId
    });
  }

  res.locals.aicsErrorCode = "INTERNAL_ERROR";
  const internal = err && err.message ? err.message : String(err);
  logger.error({
    event: "unhandled_error",
    requestId,
    route: req.originalUrl,
    error: internal.slice(0, 500),
    stack: err && err.stack ? String(err.stack).slice(0, 4000) : null
  });

  return res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: isProd ? "An unexpected error occurred" : internal.slice(0, 200),
    requestId
  });
}

/** @alias 文档与施工清单命名 */
const errorHandlerMiddleware = errorMiddleware;

module.exports = { errorMiddleware, errorHandlerMiddleware };
