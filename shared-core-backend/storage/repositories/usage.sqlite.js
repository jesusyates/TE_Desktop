/**
 * C-7 — usage_events 查询（写入由 entitlement 事务内完成）。
 */
const { getDb } = require("../db");

function listUsageByUser(user_id, limit) {
  const lim = Math.max(1, Math.min(Number(limit) || 100, 10_000));
  return getDb()
    .prepare(
      `SELECT id, user_id, product, action, amount, timestamp FROM usage_events
       WHERE user_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(user_id, lim);
}

module.exports = { listUsageByUser };
