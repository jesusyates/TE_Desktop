/**
 * 双写/读回退差异与失败：强制落日志，禁止静默吞掉。
 */
const { logger } = require("../logger");

/**
 * @param {object} p
 * @param {string|null} [p.userId]
 * @param {'profile'|'entitlement'|'task'|'taskRun'} p.entity
 * @param {'create'|'update'|'read'|'delete'|'sync'} p.operation
 * @param {boolean} [p.localSuccess]
 * @param {boolean} [p.cloudSuccess]
 * @param {unknown} [p.error]
 * @param {string|null} [p.requestId]
 */
function logStorageDiff(p) {
  const level = p.cloudSuccess === false || p.localSuccess === false ? "warn" : "info";
  const payload = {
    event: "storage_diff",
    timestamp: new Date().toISOString(),
    userId: p.userId != null ? String(p.userId) : null,
    entity: p.entity,
    operation: p.operation,
    localSuccess: p.localSuccess !== undefined ? Boolean(p.localSuccess) : null,
    cloudSuccess: p.cloudSuccess !== undefined ? Boolean(p.cloudSuccess) : null,
    error:
      p.error != null
        ? typeof p.error === "string"
          ? p.error
          : p.error && p.error.message
            ? String(p.error.message)
            : String(p.error)
        : null,
    requestId: p.requestId != null ? String(p.requestId) : null
  };
  logger[level](payload);
}

module.exports = { logStorageDiff };
