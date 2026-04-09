const {
  createEmptyContext,
  normalizeContext,
  applySessionToContext
} = require("../context/unified-context");

/**
 * 唯一 request context：每条请求先经此中间件再进入 route / compatibility。
 */
function unifiedContextMiddleware(req, res, next) {
  const ctx = createEmptyContext();
  normalizeContext(req, ctx);
  applySessionToContext(req, ctx);
  req.context = ctx;
  next();
}

/** @deprecated 使用 unifiedContextMiddleware 内联的 pickHeader；保留供少数模块复用 */
function pickHeader(req, name) {
  const v = req.get ? req.get(name) : req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

module.exports = { unifiedContextMiddleware, pickHeader };
