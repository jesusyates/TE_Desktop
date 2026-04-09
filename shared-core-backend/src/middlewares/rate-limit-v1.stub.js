const { config } = require("../infra/config");

/**
 * /v1 限速占位：配置 RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX 后在此处接入 express-rate-limit。
 */
function rateLimitV1Stub(_req, _res, next) {
  const c = config();
  if (c.rateLimitMax <= 0 || c.rateLimitWindowMs <= 0) {
    return next();
  }
  next();
}

module.exports = { rateLimitV1Stub };
