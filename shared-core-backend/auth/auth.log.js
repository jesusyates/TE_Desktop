/**
 * C-2 — Auth 可观测性（结构化日志）。禁止打印 token 明文、password。
 * register_failed 等事件可附带 requestId / 上游错误摘要（由 buildRegisterFailedPayload 生成）。
 */
const AUTH_LOG_EXTRA_KEYS = new Set([
  "requestId",
  "authProvider",
  "upstreamAction",
  "upstreamStatus",
  "upstreamCode",
  "upstreamMessage",
  "errorMessage",
  "errorName",
  "stack",
  "responseBody",
  "emailMasked",
  "errorCause",
  "failingStep",
  "sqliteTable",
  "signupParseBranch",
  "responseKeys"
]);

function authLog(payload) {
  const rec = {
    event: payload.event,
    user_id: payload.user_id != null ? payload.user_id : null,
    jti: payload.jti != null ? payload.jti : null,
    client_platform: payload.client_platform != null ? payload.client_platform : null,
    product: payload.product != null ? payload.product : null,
    timestamp: payload.timestamp || new Date().toISOString(),
    source: payload.source || "shared-core-auth"
  };
  if (payload && typeof payload === "object") {
    for (const k of AUTH_LOG_EXTRA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload, k) && payload[k] !== undefined) {
        rec[k] = payload[k];
      }
    }
  }
  console.log(JSON.stringify(rec));
}

module.exports = { authLog };
