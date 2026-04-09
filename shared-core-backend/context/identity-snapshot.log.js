/**
 * C-8 — Identity snapshot 可观测性。禁止 token / password / refresh。
 */
function identitySnapshotLog(payload) {
  const rec = {
    event: payload.event,
    task_id: payload.task_id != null ? payload.task_id : undefined,
    user_id: payload.user_id != null ? payload.user_id : null,
    market: payload.market != null ? payload.market : null,
    locale: payload.locale != null ? payload.locale : null,
    product: payload.product != null ? payload.product : null,
    client_platform: payload.client_platform != null ? payload.client_platform : null,
    session_version: payload.session_version != null ? payload.session_version : undefined,
    timestamp: payload.timestamp || new Date().toISOString(),
    source: "shared-core-identity-snapshot"
  };
  Object.keys(rec).forEach((k) => rec[k] === undefined && delete rec[k]);
  console.log(JSON.stringify(rec));
}

module.exports = { identitySnapshotLog };
