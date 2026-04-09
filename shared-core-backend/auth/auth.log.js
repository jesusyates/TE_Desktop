/**
 * C-2 — Auth 可观测性（结构化日志）。禁止打印 token 明文、password。
 */
function authLog(payload) {
  const rec = {
    event: payload.event,
    user_id: payload.user_id != null ? payload.user_id : null,
    jti: payload.jti != null ? payload.jti : null,
    client_platform: payload.client_platform != null ? payload.client_platform : null,
    product: payload.product != null ? payload.product : null,
    timestamp: payload.timestamp || new Date().toISOString(),
    source: "shared-core-auth"
  };
  console.log(JSON.stringify(rec));
}

module.exports = { authLog };
