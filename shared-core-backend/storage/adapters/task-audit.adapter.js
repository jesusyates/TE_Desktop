/**
 * C-8 — task-audit.store 的 SQLite 实现。
 */
const repo = require("../repositories/task-audit.sqlite");

function insertStarted(row) {
  repo.insertStarted(row);
}

function updateStatus(task_id, status, updated_at) {
  repo.updateStatus(task_id, status, updated_at);
}

function getByTaskId(task_id) {
  return repo.getByTaskId(task_id);
}

module.exports = { insertStarted, updateStatus, getByTaskId };
