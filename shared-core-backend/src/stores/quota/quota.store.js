/**
 * Quota：摘要读 entitlement；扣减走 billing atomicConsume（SQLite/内存事务）。
 */
const entitlementAccountStore = require("../account/entitlement.store");
const coreEntitlementStore = require("../../../billing/entitlement.store");
const { normalizeQuotaRecord } = require("../../schemas/quota.schema");

class QuotaStore {
  /**
   * @param {string} userId
   * @param {string} product
   * @param {string|null} requestId
   */
  async getSummary(userId, product, requestId = null) {
    const uid = userId != null ? String(userId).trim() : "";
    const prod = product != null ? String(product).trim().toLowerCase() : "aics";
    if (!uid) {
      return normalizeQuotaRecord({
        userId: uid,
        plan: "free",
        quota: 0,
        used: 0,
        updated_at: new Date().toISOString()
      });
    }
    const row = await entitlementAccountStore.getForProduct(uid, prod, requestId);
    if (!row) {
      const local = coreEntitlementStore.getOrCreate(uid, prod);
      return normalizeQuotaRecord({
        userId: uid,
        plan: local.plan,
        quota: local.quota,
        used: local.used,
        updated_at: local.updated_at
      });
    }
    return normalizeQuotaRecord({
      userId: row.user_id,
      plan: row.plan,
      quota: row.quota,
      used: row.used,
      updated_at: row.updated_at
    });
  }

  /**
   * @returns {{ ok: boolean, code?: string, entitlement?: object }}
   */
  consumeTokens(userId, product, amount, meta) {
    const uid = userId != null ? String(userId).trim() : "";
    const prod = product != null ? String(product).trim().toLowerCase() : "aics";
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    return coreEntitlementStore.atomicConsume(uid, prod, "ai_tokens", n, meta || {});
  }
}

let _singleton = null;

function getQuotaStoreInstance() {
  if (!_singleton) _singleton = new QuotaStore();
  return _singleton;
}

module.exports = { QuotaStore, getQuotaStoreInstance };
