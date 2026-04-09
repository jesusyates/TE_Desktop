/**
 * C-4 — buildRequestContext：在已有统一 req.context 上合并会话 + entitlement（计费后调用）。
 */
const { buildRequestContextObject } = require("./request-context.util");
const { contextLog } = require("./context.log");

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {(req: import('http').IncomingMessage, res: import('http').ServerResponse, status: number, data: object) => void} send
 * @returns {boolean}
 */
function buildRequestContext(req, res, send) {
  if (!req.context || typeof req.context !== "object") {
    send(req, res, 500, { message: "context_not_initialized" });
    return false;
  }
  const r = buildRequestContextObject(req);
  if (!r.ok) {
    send(req, res, 400, { message: r.message });
    return false;
  }
  const base = req.context;
  req.context = {
    ...base,
    userId: r.value.userId,
    platform: r.value.platform,
    product: r.value.product,
    market: r.value.market,
    locale: r.value.locale,
    entitlement: r.value.entitlement
  };
  const c = req.context;
  contextLog({
    event: "request_context_built",
    user_id: c.userId,
    market: c.market,
    locale: c.locale,
    product: c.product,
    client_platform: c.platform
  });
  return true;
}

module.exports = { buildRequestContext };
