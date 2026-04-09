/**
 * D-7-3L：Usage 读路径收口（封装 store + limit，与历史 HTTP 行为一致）。
 */
const { listUsageByUser } = require("../usageStore");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function clampUsageLimit(rawQuery) {
  const n = parseInt(rawQuery || String(DEFAULT_LIMIT), 10);
  const v = Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, v));
}

/**
 * @param {string} userId
 * @param {string | null} limitQuery — URL.searchParams.get("limit")
 */
function listUsage(userId, limitQuery) {
  const lim = clampUsageLimit(limitQuery);
  return listUsageByUser(userId, lim);
}

module.exports = {
  listUsage,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
