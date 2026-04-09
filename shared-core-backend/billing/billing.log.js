/**
 * C-3 — Billing / Entitlement 可观测性（禁止打印 token、password）。
 */
function billingLog(payload) {
  const rec = {
    event: payload.event,
    user_id: payload.user_id != null ? payload.user_id : null,
    product: payload.product != null ? payload.product : null,
    amount: payload.amount != null ? payload.amount : null,
    timestamp: payload.timestamp || new Date().toISOString(),
    source: "shared-core-billing"
  };
  console.log(JSON.stringify(rec));
}

module.exports = { billingLog };
