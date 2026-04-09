/**
 * D-7-3L：Result 读路径收口（封装 store + limit，与历史 HTTP 行为一致）。
 */
const { listRecentResults, getResultByRunId } = require("../resultStore");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampResultsLimit(rawQuery) {
  const n = parseInt(rawQuery || String(DEFAULT_LIMIT), 10);
  const v = Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, v));
}

/**
 * @param {string} userId
 * @param {string | null} limitQuery — URL.searchParams.get("limit")
 */
function listResults(userId, limitQuery) {
  const lim = clampResultsLimit(limitQuery);
  return listRecentResults(lim, userId);
}

/**
 * @param {string} runId
 * @param {string} userId
 */
function getResultByRunIdForUser(runId, userId) {
  return getResultByRunId(runId, userId);
}

module.exports = {
  listResults,
  getResultByRunIdForUser,
  DEFAULT_LIMIT,
  MAX_LIMIT
};
