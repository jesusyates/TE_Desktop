/**
 * C-5 — preference 内存实现。
 */
/** @type {Map<string, { user_id: string, market: string, locale: string, updated_at: string, source: string }>} */
const byUser = new Map();

function get(user_id) {
  return byUser.get(user_id) || null;
}

function set(row) {
  byUser.set(row.user_id, row);
  return row;
}

module.exports = { get, set };
