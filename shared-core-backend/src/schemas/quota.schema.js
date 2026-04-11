/**
 * Quota 摘要 API 形状（与 entitlement 对齐，token 计量）
 */

function normalizeQuotaRecord(row) {
  if (!row || typeof row !== "object") return null;
  const userId =
    row.userId != null ? String(row.userId) : row.user_id != null ? String(row.user_id) : "";
  const plan = row.plan != null ? String(row.plan) : "free";
  const quotaLimit = Number(row.quotaLimit != null ? row.quotaLimit : row.quota) || 0;
  const quotaUsed = Number(row.quotaUsed != null ? row.quotaUsed : row.used) || 0;
  const quotaRemaining = Math.max(0, quotaLimit - quotaUsed);
  const updatedAt =
    row.updatedAt != null
      ? String(row.updatedAt)
      : row.updated_at != null
        ? String(row.updated_at)
        : "";
  return { userId, plan, quotaLimit, quotaUsed, quotaRemaining, updatedAt };
}

module.exports = { normalizeQuotaRecord };
