/**
 * C-3 / C-8 — Usage 记录入口；须携带 identity_snapshot + task_id（任务内）。
 * 禁止：失败回滚已真实发生的 usage_event。
 */
const { applyUsage } = require("./entitlement.service");
const { billingLog } = require("./billing.log");

/**
 * @param {object} [options] — { identity_snapshot?, task_id? }
 * @returns {{ ok: true, entitlement: object } | { ok: false, code: string }}
 */
function recordUsage(user_id, product, action, amount, options = {}) {
  const { identity_snapshot = null, task_id = null } = options || {};
  const usageMeta =
    identity_snapshot != null
      ? {
          market: identity_snapshot.market,
          locale: identity_snapshot.locale,
          client_platform: identity_snapshot.client_platform,
          session_version: identity_snapshot.session_version,
          task_id
        }
      : { task_id };
  const r = applyUsage(user_id, product, action, amount, usageMeta);
  if (!r.ok) {
    billingLog({
      event: "entitlement_check_fail",
      user_id,
      product,
      amount,
      timestamp: new Date().toISOString()
    });
  }
  return r;
}

module.exports = { recordUsage };
