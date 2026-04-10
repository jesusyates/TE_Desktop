const {
  createEmptyContext,
  normalizeContext,
  applySessionToContext
} = require("../context/unified-context");

/**
 * 唯一 request context：每条请求先经此中间件再进入 route / compatibility。
 */
async function unifiedContextMiddleware(req, res, next) {
  try {
    const ctx = createEmptyContext();
    normalizeContext(req, ctx);
    await applySessionToContext(req, ctx);
    req.context = ctx;
    next();
  } catch (e) {
    next(e);
  }
}

/** @deprecated 使用 unifiedContextMiddleware 内联的 pickHeader；保留供少数模块复用 */
function pickHeader(req, name) {
  const v = req.get ? req.get(name) : req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

module.exports = { unifiedContextMiddleware, pickHeader };
