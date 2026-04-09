/** C-8 — task_audits 内存 */
/** @type {Map<string, object>} */
const rows = new Map();

function insertStarted(row) {
  rows.set(row.task_id, { ...row });
}

function updateStatus(task_id, status, updated_at) {
  const r = rows.get(task_id);
  if (r) {
    r.status = status;
    r.updated_at = updated_at;
  }
}

function getByTaskId(task_id) {
  return rows.get(task_id) || null;
}

module.exports = { insertStarted, updateStatus, getByTaskId };
