/**
 * C-7 — session_versions 表访问。
 */
const { getDb } = require("../db");

function getVersion(user_id) {
  const r = getDb()
    .prepare(`SELECT version FROM session_versions WHERE user_id = ?`)
    .get(user_id);
  if (!r) return null;
  return r.version;
}

function bump(user_id) {
  const db = getDb();
  const now = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE;");
  try {
    const row = db.prepare(`SELECT version FROM session_versions WHERE user_id = ?`).get(user_id);
    const cur = row ? row.version : 1;
    const next = cur + 1;
    if (!row) {
      db.prepare(`INSERT INTO session_versions (user_id, version, updated_at) VALUES (?, ?, ?)`).run(
        user_id,
        next,
        now
      );
    } else {
      db.prepare(`UPDATE session_versions SET version = ?, updated_at = ? WHERE user_id = ?`).run(
        next,
        now,
        user_id
      );
    }
    db.exec("COMMIT;");
    return next;
  } catch (e) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* ignore */
    }
    throw e;
  }
}

module.exports = { getVersion, bump };
