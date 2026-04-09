/**
 * C-8 — Task 审计（持久化）。与 identity_snapshot 同源。
 *
 * 禁止：与 usage / generate 使用不一致身份；破坏 quota 主模型。
 */
const store = require("./task-audit.store");
const { identitySnapshotLog } = require("../context/identity-snapshot.log");

function baseLog(event, task_id, snap) {
  identitySnapshotLog({
    event,
    task_id,
    user_id: snap.user_id,
    market: snap.market,
    locale: snap.locale,
    product: snap.product,
    client_platform: snap.client_platform,
    session_version: snap.session_version
  });
}

function snapshotToRow(task_id, identity_snapshot, status, t) {
  const ent = identity_snapshot.entitlement;
  return {
    task_id,
    user_id: identity_snapshot.user_id,
    product: identity_snapshot.product,
    market: identity_snapshot.market,
    locale: identity_snapshot.locale,
    client_platform: identity_snapshot.client_platform,
    plan: ent ? ent.plan : null,
    quota: ent ? ent.quota : null,
    used: ent ? ent.used : null,
    session_version: identity_snapshot.session_version,
    status,
    created_at: t,
    updated_at: t
  };
}

function createTaskAudit(task_id, identity_snapshot) {
  const t = new Date().toISOString();
  store.insertStarted(snapshotToRow(task_id, identity_snapshot, "started", t));
  baseLog("task_audit_started", task_id, identity_snapshot);
}

function completeTaskAudit(task_id, identity_snapshot) {
  const t = new Date().toISOString();
  store.updateStatus(task_id, "completed", t);
  baseLog("task_audit_completed", task_id, identity_snapshot);
}

function failTaskAudit(task_id, identity_snapshot) {
  const t = new Date().toISOString();
  store.updateStatus(task_id, "failed", t);
  baseLog("task_audit_failed", task_id, identity_snapshot);
}

function markTaskAuditQuotaBlocked(task_id, identity_snapshot) {
  const t = new Date().toISOString();
  store.updateStatus(task_id, "quota_blocked", t);
  baseLog("task_audit_quota_blocked", task_id, identity_snapshot);
}

module.exports = {
  createTaskAudit,
  completeTaskAudit,
  failTaskAudit,
  markTaskAuditQuotaBlocked
};
