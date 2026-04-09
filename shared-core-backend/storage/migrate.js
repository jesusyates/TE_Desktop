/**
 * C-7 — 幂等迁移。禁止无迁移启动；禁止每次启动 DROP 重建。
 */
const fs = require("fs");
const path = require("path");
const { getDb, isMemoryStorage } = require("./db");
const { storageLog } = require("./storage.log");

function usageEventsHasColumn(db, column) {
  const rows = db.prepare(`PRAGMA table_info(usage_events)`).all();
  return rows.some((r) => r.name === column);
}

function usersHasColumn(db, column) {
  try {
    const rows = db.prepare(`PRAGMA table_info(users)`).all();
    return rows.some((r) => r.name === column);
  } catch {
    return false;
  }
}

function executionHistoryHasColumn(db, column) {
  try {
    const rows = db.prepare(`PRAGMA table_info(execution_history)`).all();
    return rows.some((r) => r.name === column);
  } catch {
    return false;
  }
}

/**
 * C-8：对已存在库幂等补列 / 建 task_audits。
 */
function applyIncrementalMigrations(db) {
  const usageCols = ["market", "locale", "client_platform", "session_version", "task_id"];
  for (const col of usageCols) {
    if (!usageEventsHasColumn(db, col)) {
      const typ =
        col === "session_version"
          ? "INTEGER"
          : col === "task_id"
            ? "TEXT"
            : "TEXT";
      db.exec(`ALTER TABLE usage_events ADD COLUMN ${col} ${typ};`);
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_audits (
      task_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      product TEXT NOT NULL,
      market TEXT NOT NULL,
      locale TEXT NOT NULL,
      client_platform TEXT NOT NULL,
      plan TEXT,
      quota INTEGER,
      used INTEGER,
      session_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_usage_task ON usage_events (task_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_task_audit_user ON task_audits (user_id);");
  /** D-7-5I：内测账号状态（active / suspended 等） */
  if (!usersHasColumn(db, "status")) {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';`);
  }
  /** J-1+：关联 Core execution task，供工作台只读恢复 */
  if (!executionHistoryHasColumn(db, "source_task_id")) {
    db.exec(`ALTER TABLE execution_history ADD COLUMN source_task_id TEXT;`);
  }
  /** Auth v1：邮箱验证时间 */
  if (!usersHasColumn(db, "email_verified_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN email_verified_at TEXT;`);
  }
}

function runMigrations() {
  if (isMemoryStorage()) {
    return;
  }
  const db = getDb();
  const sqlPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  db.exec(sql);
  applyIncrementalMigrations(db);
  storageLog({ event: "storage_migrated" });
}

module.exports = { runMigrations };
