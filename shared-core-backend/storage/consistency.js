/**
 * C-7 — 启动自检。严重异常记 storage_consistency_fail 并抛错退出。
 */
const { getDb, isMemoryStorage } = require("./db");
const { storageLog } = require("./storage.log");

function fail(reason, detail) {
  storageLog({ event: "storage_consistency_fail", reason, detail });
  throw new Error(`storage_consistency_fail: ${reason}`);
}

function runConsistencyCheck() {
  if (isMemoryStorage()) {
    return;
  }
  const db = getDb();
  const row = db.prepare("PRAGMA integrity_check").get();
  const ic = row && row.integrity_check != null ? row.integrity_check : row;
  if (ic !== "ok") {
    fail("integrity_check", String(ic));
  }

  const dupEmails = db.prepare(`SELECT email, COUNT(*) AS c FROM users GROUP BY email HAVING c > 1`).all();
  if (dupEmails.length > 0) {
    fail("users_email_duplicates", JSON.stringify(dupEmails));
  }

  const badRev = db
    .prepare(`SELECT COUNT(*) AS n FROM refresh_tokens WHERE revoked NOT IN (0, 1)`)
    .get();
  if (badRev && badRev.n > 0) {
    fail("refresh_revoked_domain", String(badRev.n));
  }

  const badVer = db.prepare(`SELECT COUNT(*) AS n FROM session_versions WHERE version < 1`).get();
  if (badVer && badVer.n > 0) {
    fail("session_version_min", String(badVer.n));
  }

  storageLog({ event: "storage_consistency_pass" });
}

module.exports = { runConsistencyCheck };
