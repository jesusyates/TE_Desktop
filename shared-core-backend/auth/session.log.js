/**
 * C-6 — Session 可观测性。禁止 token / refresh_token / password。
 */
function sessionLog(payload) {
  const rec = {
    event: payload.event,
    user_id: payload.user_id != null ? payload.user_id : null,
    market: payload.market != null ? payload.market : null,
    locale: payload.locale != null ? payload.locale : null,
    product: payload.product != null ? payload.product : null,
    client_platform: payload.client_platform != null ? payload.client_platform : null,
    from_version: payload.from_version != null ? payload.from_version : undefined,
    to_version: payload.to_version != null ? payload.to_version : undefined,
    token_session_version:
      payload.token_session_version != null ? payload.token_session_version : undefined,
    current_session_version:
      payload.current_session_version != null ? payload.current_session_version : undefined,
    timestamp: payload.timestamp || new Date().toISOString(),
    source_system: "shared-core-session"
  };
  console.log(JSON.stringify(rec));
}

module.exports = { sessionLog };
