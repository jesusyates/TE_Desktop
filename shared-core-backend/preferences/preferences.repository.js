/**
 * C-5 — 仓储抽象；handler 禁止直触 store。
 */
const store = require("./preferences.store");

function findByUserId(user_id) {
  return store.get(user_id);
}

function upsert(row) {
  return store.set({ ...row });
}

module.exports = { findByUserId, upsert };
