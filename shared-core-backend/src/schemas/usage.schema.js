/**
 * Usage 计量记录 API形状
 */

function normalizeUsageRecord(row) {
  if (!row || typeof row !== "object") return null;
  const usageId =
    row.usageId != null ? String(row.usageId) : row.id != null ? String(row.id) : "";
  const userId =
    row.userId != null ? String(row.userId) : row.user_id != null ? String(row.user_id) : "";
  const runId =
    row.runId != null ? String(row.runId) : row.run_id != null ? String(row.run_id) : "";
  const provider = row.provider != null ? String(row.provider) : "";
  const model = row.model != null ? String(row.model) : "";
  const totalTokens = Number(row.totalTokens != null ? row.totalTokens : row.total_tokens) || 0;
  const cost = row.cost != null ? Number(row.cost) : 0;
  const createdAt =
    row.createdAt != null
      ? String(row.createdAt)
      : row.created_at != null
        ? String(row.created_at)
        : "";
  const market = row.market != null ? String(row.market) : "global";
  const locale = row.locale != null ? String(row.locale) : "en-US";
  const product = row.product != null ? String(row.product) : "aics";
  return { usageId, userId, runId, provider, model, totalTokens, cost, createdAt, market, locale, product };
}

module.exports = { normalizeUsageRecord };
