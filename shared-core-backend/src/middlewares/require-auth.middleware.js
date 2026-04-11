const { sendV1Failure } = require("../utils/v1-http");

/**
 * /v1 受保护路由：身份必须来自 request context（会话/JWT 或集中式 dev 回退）。
 */
function requireAuthV1Middleware(req, res, next) {
  const uid = req.context && req.context.userId;
  if (uid == null || String(uid).trim() === "") {
    return sendV1Failure(res, req, 401, "UNAUTHORIZED", "Authentication required");
  }
  next();
}

module.exports = { requireAuthV1Middleware };
