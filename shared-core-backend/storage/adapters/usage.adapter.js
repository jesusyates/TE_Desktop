/**
 * C-7 — usage.store 的 SQLite 实现（独立 append 仅测试/内部可选；正常扣减在 entitlement 事务内）。
 */
const { getDb } = require("../db");

function append(event) {
  const db = getDb();
  db.prepare(
    `INSERT INTO usage_events (user_id, product, action, amount, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  ).run(event.user_id, event.product, event.action, event.amount, event.timestamp);
}

function listSince(max) {
  const lim = max == null ? 10_000 : Math.min(max, 10_000);
  const rows = getDb()
    .prepare(
      `SELECT user_id, product, action, amount, timestamp FROM usage_events ORDER BY id DESC LIMIT ?`
    )
    .all(lim);
  return rows.reverse();
}

function listUsageByUser(user_id, limit) {
  const repo = require("../repositories/usage.sqlite");
  return repo.listUsageByUser(user_id, limit);
}

module.exports = { append, listSince, listUsageByUser };
