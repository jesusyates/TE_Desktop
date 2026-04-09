/**
 * C-7 — preferences.store 的 SQLite 实现。
 */
const prefRepo = require("../repositories/preferences.sqlite");

function get(user_id) {
  return prefRepo.findByUserId(user_id);
}

function set(row) {
  prefRepo.upsertRow(row);
  return row;
}

module.exports = { get, set };
