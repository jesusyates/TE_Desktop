/**
 * C-5 — 禁止打印 token / password / refresh。
 */
function preferenceLog(payload) {
  const rec = {
    event: payload.event,
    user_id: payload.user_id != null ? payload.user_id : null,
    market: payload.market != null ? payload.market : null,
    locale: payload.locale != null ? payload.locale : null,
    source: payload.source != null ? payload.source : null,
    timestamp: payload.timestamp || new Date().toISOString(),
    source_system: "shared-core-preferences"
  };
  console.log(JSON.stringify(rec));
}

module.exports = { preferenceLog };
