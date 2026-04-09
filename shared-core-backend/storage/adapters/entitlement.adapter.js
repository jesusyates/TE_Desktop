/**
 * C-7 — entitlement.store 的 SQLite 实现。
 */
const entRepo = require("../repositories/entitlement.sqlite");

function getOrCreate(user_id, product) {
  return entRepo.getOrCreate(user_id, product);
}

function atomicConsume(user_id, product, action, amount, meta) {
  return entRepo.atomicConsume(user_id, product, action, amount, meta);
}

module.exports = { getOrCreate, atomicConsume };
