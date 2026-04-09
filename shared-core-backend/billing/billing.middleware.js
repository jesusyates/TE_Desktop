/**
 * C-3 / C-8 — 任务链路强制：session 之后、执行 runTask 之前。
 * 禁止：客户端自行判定 quota；task_run 与 generate 身份不一致。
 */
const entitlementService = require("./entitlement.service");
const preferencesSync = require("../preferences/preferences-sync.service");

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {(req: import('http').IncomingMessage, res: import('http').ServerResponse, status: number, data: object) => void} send
 * @param {number} [amount]
 * @returns {boolean}
 */
function requireEntitlementOr402(req, res, send, amount = 1) {
  if (!req.session || !req.session.user_id || !req.session.product) {
    send(req, res, 401, { message: "unauthorized" });
    return false;
  }
  const usageMeta = {
    task_id: req.taskIdForUsage != null ? req.taskIdForUsage : null,
    market: req.session.market,
    locale: req.session.locale,
    client_platform: req.session.client_platform,
    session_version: preferencesSync.getCurrentSessionVersion(req.session.user_id)
  };
  const r = entitlementService.checkAndConsume(
    req.session.user_id,
    req.session.product,
    amount,
    usageMeta
  );
  if (!r.ok) {
    send(req, res, 402, { message: r.code });
    return false;
  }
  req.entitlement = {
    plan: r.entitlement.plan,
    quota: r.entitlement.quota,
    used: r.entitlement.used
  };
  return true;
}

module.exports = { requireEntitlementOr402 };
