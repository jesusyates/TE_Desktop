/**
 * C-7 — preferences 表访问。
 */
const { getDb } = require("../db");

function findByUserId(user_id) {
  const r = getDb()
    .prepare(
      `SELECT user_id, market, locale, source, updated_at FROM preferences WHERE user_id = ?`
    )
    .get(user_id);
  return r || null;
}

function upsertRow(row) {
  const { user_id, market, locale, source, updated_at } = row;
  getDb()
    .prepare(
      `INSERT INTO preferences (user_id, market, locale, source, updated_at)
       VALUES (@user_id, @market, @locale, @source, @updated_at)
       ON CONFLICT(user_id) DO UPDATE SET
         market = excluded.market,
         locale = excluded.locale,
         source = excluded.source,
         updated_at = excluded.updated_at`
    )
    .run({ user_id, market, locale, source, updated_at });
}

module.exports = { findByUserId, upsertRow };
