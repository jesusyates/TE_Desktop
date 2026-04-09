/**
 * D-1 — execution_history 表访问；按 user_id 隔离；逻辑删除。
 */
const { getDb } = require("../db");

/**
 * @param {{ history_id: string; user_id: string; prompt: string; preview: string; status: string; mode: string; created_at: string; deleted: number; source_task_id?: string | null }} row
 */
function insert(row) {
  getDb()
    .prepare(
      `INSERT INTO execution_history (history_id, user_id, prompt, preview, status, mode, created_at, deleted, source_task_id)
       VALUES (@history_id, @user_id, @prompt, @preview, @status, @mode, @created_at, @deleted, @source_task_id)`
    )
    .run({ ...row, source_task_id: row.source_task_id ?? null });
}

/**
 * @param {string | null} [status] success | error | stopped — optional filter
 */
function listByUser(user_id, page, pageSize, status = null) {
  const offset = (page - 1) * pageSize;
  const db = getDb();
  if (status) {
    const total = db
      .prepare(
        `SELECT COUNT(*) as c FROM execution_history WHERE user_id = ? AND deleted = 0 AND status = ?`
      )
      .get(user_id, status).c;
    const list = db
      .prepare(
        `SELECT history_id, user_id, prompt, preview, status, mode, created_at, deleted, source_task_id
         FROM execution_history WHERE user_id = ? AND deleted = 0 AND status = ?
         ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`
      )
      .all(user_id, status, pageSize, offset);
    return { list, total };
  }
  const total = db
    .prepare(`SELECT COUNT(*) as c FROM execution_history WHERE user_id = ? AND deleted = 0`)
    .get(user_id).c;
  const list = db
    .prepare(
      `SELECT history_id, user_id, prompt, preview, status, mode, created_at, deleted, source_task_id
       FROM execution_history WHERE user_id = ? AND deleted = 0
       ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?`
    )
    .all(user_id, pageSize, offset);
  return { list, total };
}

/**
 * @param {string} user_id
 * @param {string} history_id
 */
function getByIdForUser(user_id, history_id) {
  return getDb()
    .prepare(
      `SELECT history_id, user_id, prompt, preview, status, mode, created_at, deleted, source_task_id
       FROM execution_history WHERE history_id = ? AND user_id = ? AND deleted = 0`
    )
    .get(history_id, user_id);
}

function softDelete(user_id, history_id) {
  const r = getDb()
    .prepare(
      `UPDATE execution_history SET deleted = 1 WHERE history_id = ? AND user_id = ? AND deleted = 0`
    )
    .run(history_id, user_id);
  return r.changes > 0;
}

module.exports = { insert, listByUser, getByIdForUser, softDelete };
