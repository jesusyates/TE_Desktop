const { logger } = require("../infra/logger");

/**
 * 根路径兼容层：非正式 API；新集成必须使用 /v1/*。
 */
function compatibilityDeprecationMiddleware(req, res, next) {
  res.set("X-API-Compat-Deprecated", "true");
  res.set("Deprecation", "true");
  res.set("Link", "</v1/docs>; rel=\"successor-version\"");
  logger.warn({
    event: "compat_deprecated_route",
    route: req.originalUrl,
    requestId: req.context && req.context.requestId
  });
  next();
}

module.exports = { compatibilityDeprecationMiddleware };
