/**
 * C-8 验证：task_audits 状态、usage_events 新列、重启可读。
 * 运行：node shared-core-backend/scripts/c8-identity-smoke.js（仓库根：npm run test:c8-identity）
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmpDb = path.join(os.tmpdir(), `aics-c8-smoke-${Date.now()}.sqlite`);
try {
  fs.unlinkSync(tmpDb);
} catch {
  /* ignore */
}

process.env.SHARED_CORE_DB_PATH = tmpDb;
delete process.env.SHARED_CORE_STORAGE;
process.env.SHARED_CORE_STORAGE_LOG = "0";

const { initStorage, closeStorage, getDb } = require("../storage/db");
const { runMigrations } = require("../storage/migrate");
const { runConsistencyCheck } = require("../storage/consistency");
const taskAuditService = require("../tasks/task-audit.service");
const entitlementRepo = require("../storage/repositories/entitlement.sqlite");

function assert(cond, msg) {
  if (!cond) {
    console.error("[c8-smoke] FAIL:", msg);
    process.exit(1);
  }
}

const snapshot = (uid, ent) => ({
  user_id: uid,
  market: "cn",
  locale: "zh-CN",
  product: "aics",
  client_platform: "desktop",
  entitlement: ent,
  session_version: 1,
  captured_at: new Date().toISOString()
});

console.log("[c8-smoke] db:", tmpDb);

initStorage();
runMigrations();
runConsistencyCheck();

const uid = "user-c8-test";
const taskId = "task_c8_1";

getDb()
  .prepare(
    `INSERT INTO users (user_id, email, password_hash, market, locale, created_at, updated_at)
     VALUES (?, 'c8@test', 'x', 'cn', 'zh-CN', ?, ?)`
  )
  .run(uid, new Date().toISOString(), new Date().toISOString());

entitlementRepo
  .getOrCreate(uid, "aics");

const ent = { plan: "free", quota: 100, used: 0 };
const snap = snapshot(uid, ent);

taskAuditService.createTaskAudit(taskId, snap);
let row = getDb().prepare(`SELECT status FROM task_audits WHERE task_id = ?`).get(taskId);
assert(row && row.status === "started", "audit started");

taskAuditService.completeTaskAudit(taskId, snap);
row = getDb().prepare(`SELECT status FROM task_audits WHERE task_id = ?`).get(taskId);
assert(row && row.status === "completed", "audit completed");

const taskId2 = "task_c8_fail";
taskAuditService.createTaskAudit(taskId2, snap);
taskAuditService.failTaskAudit(taskId2, snap);
row = getDb().prepare(`SELECT status FROM task_audits WHERE task_id = ?`).get(taskId2);
assert(row && row.status === "failed", "audit failed");

const taskId3 = "task_c8_q";
taskAuditService.createTaskAudit(taskId3, snap);
taskAuditService.markTaskAuditQuotaBlocked(taskId3, snap);
row = getDb().prepare(`SELECT status FROM task_audits WHERE task_id = ?`).get(taskId3);
assert(row && row.status === "quota_blocked", "audit quota_blocked");

entitlementRepo.atomicConsume(uid, "aics", "task_run", 1, {
  market: "cn",
  locale: "zh-CN",
  client_platform: "desktop",
  session_version: 1,
  task_id: taskId
});
entitlementRepo.atomicConsume(uid, "aics", "generate", 1, {
  market: "cn",
  locale: "zh-CN",
  client_platform: "desktop",
  session_version: 1,
  task_id: taskId
});

const evs = getDb()
  .prepare(
    `SELECT action, task_id, market, locale, session_version FROM usage_events WHERE user_id = ? ORDER BY id`
  )
  .all(uid);
const taskRun = evs.find((e) => e.action === "task_run");
const gen = evs.find((e) => e.action === "generate");
assert(taskRun && taskRun.task_id === taskId && taskRun.market === "cn", "usage task_run meta");
assert(gen && gen.task_id === taskId && gen.session_version === 1, "usage generate meta");

closeStorage();
initStorage();
runMigrations();
runConsistencyCheck();

const n = getDb().prepare(`SELECT COUNT(*) AS c FROM task_audits`).get().c;
assert(n >= 3, "task_audits survive reopen");

closeStorage();
try {
  fs.unlinkSync(tmpDb);
} catch {
  /* ignore */
}

console.log("[c8-smoke] ALL OK");
