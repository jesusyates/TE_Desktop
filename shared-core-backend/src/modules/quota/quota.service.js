/**
 * Quota API与执行前检查（摘要来自 entitlement）
 */
const { config } = require("../../infra/config");
const { userKey } = require("../../schemas/domain-stores.schema");
const { getQuotaStoreInstance } = require("../../stores/quota/quota.store");

/**
 * GET /v1/quota 形状
 * @param {import('express').Request['context']} ctx
 */
async function getQuotaForApi(ctx) {
  const userId = userKey(ctx);
  const product = String(ctx.product || config().defaultProduct || "aics")
    .trim()
    .toLowerCase();
  const row = await getQuotaStoreInstance().getSummary(userId, product, ctx.requestId || null);
  return {
    plan: row.plan,
    quotaLimit: row.quotaLimit,
    quotaUsed: row.quotaUsed,
    quotaRemaining: row.quotaRemaining
  };
}

/**
 * @param {string} userId
 * @param {string} product
 * @param {string|null} requestId
 */
async function checkQuota(userId, product, requestId = null) {
  const uid = userId != null ? String(userId).trim() : "";
  const prod = product != null ? String(product).trim().toLowerCase() : "aics";
  const s = await getQuotaStoreInstance().getSummary(uid, prod, requestId);
  return {
    allowed: s.quotaRemaining > 0,
    quotaRemaining: s.quotaRemaining,
    quotaLimit: s.quotaLimit,
    quotaUsed: s.quotaUsed,
    plan: s.plan
  };
}

module.exports = { getQuotaForApi, checkQuota };
