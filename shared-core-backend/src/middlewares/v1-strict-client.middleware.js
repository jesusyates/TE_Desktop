const { config } = require("../infra/config");
const { AppError } = require("../utils/AppError");

/**
 * 生产环境 /v1 强制要求 X-Client-Product + X-Client-Platform（避免 silent 兜底）。
 */
function v1StrictClientHeadersMiddleware(req, res, next) {
  const c = config();
  if (c.nodeEnv !== "production") return next();
  const ctx = req.context;
  if (!ctx.product || !ctx.platform) {
    return next(
      new AppError(
        "CLIENT_HEADERS_REQUIRED",
        "X-Client-Product and X-Client-Platform are required for /v1 in production",
        400
      )
    );
  }
  next();
}

module.exports = { v1StrictClientHeadersMiddleware };
