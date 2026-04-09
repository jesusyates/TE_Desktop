/**
 * C-7 — Core 存储可观测性。禁止记录 token / password / refresh 明文。
 */
function storageLog(payload) {
  if (process.env.SHARED_CORE_STORAGE_LOG === "0") {
    return;
  }
  const rec = {
    event: payload.event,
    timestamp: new Date().toISOString(),
    source: "shared-core-storage",
    backend: payload.backend != null ? payload.backend : undefined,
    path: payload.path != null ? payload.path : undefined,
    reason: payload.reason != null ? payload.reason : undefined,
    detail: payload.detail != null ? payload.detail : undefined
  };
  Object.keys(rec).forEach((k) => rec[k] === undefined && delete rec[k]);
  console.log(JSON.stringify(rec));
}

module.exports = { storageLog };
