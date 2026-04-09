/**
 * C-8 — task_audits 表。禁止 handler 直接 require。
 */
const { getDb } = require("../db");

function insertStarted(row) {
  getDb()
    .prepare(
      `INSERT INTO task_audits (
         task_id, user_id, product, market, locale, client_platform,
         plan, quota, used, session_version, status, created_at, updated_at
       ) VALUES (
         @task_id, @user_id, @product, @market, @locale, @client_platform,
         @plan, @quota, @used, @session_version, @status, @created_at, @updated_at
       )`
    )
    .run(row);
}

function updateStatus(task_id, status, updated_at) {
  getDb()
    .prepare(`UPDATE task_audits SET status = ?, updated_at = ? WHERE task_id = ?`)
    .run(status, updated_at, task_id);
}

function getByTaskId(task_id) {
  return getDb().prepare(`SELECT * FROM task_audits WHERE task_id = ?`).get(task_id) || null;
}

module.exports = { insertStarted, updateStatus, getByTaskId };
