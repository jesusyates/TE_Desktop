/**
 * C-4 — Identity / request context 可观测性（禁止 token/password/refresh）。
 */
function contextLog(payload) {
  const rec = {
    event: payload.event,
    user_id: payload.user_id != null ? payload.user_id : null,
    market: payload.market != null ? payload.market : null,
    locale: payload.locale != null ? payload.locale : null,
    product: payload.product != null ? payload.product : null,
    client_platform: payload.client_platform != null ? payload.client_platform : null,
    timestamp: payload.timestamp || new Date().toISOString(),
    source: "shared-core-context"
  };
  console.log(JSON.stringify(rec));
}

module.exports = { contextLog };
