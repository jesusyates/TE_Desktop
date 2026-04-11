/**
 * C-3 — entitlement 内存 + 与 usage.store.memory 一致的扣减路径。
 */
const usageStore = require("./usage.store.memory");

function defaultQuotaTokens() {
  try {
    const { config } = require("../src/infra/config");
    const n = config().quotaDefaultTokens;
    return Number.isFinite(n) && n > 0 ? n : 100_000;
  } catch {
    return 100_000;
  }
}

/** @type {Map<string, object>} */
const byKey = new Map();

function keyOf(user_id, product) {
  return `${user_id}:${product}`;
}

function getOrCreate(user_id, product) {
  const k = keyOf(user_id, product);
  if (!byKey.has(k)) {
    const now = new Date().toISOString();
    byKey.set(k, {
      user_id,
      product,
      plan: "free",
      quota: defaultQuotaTokens(),
      used: 0,
      status: "active",
      created_at: now,
      updated_at: now
    });
  }
  return byKey.get(k);
}

/**
 * @param {object} [meta] — C-8 维度
 */
function atomicConsume(user_id, product, action, amount, meta = {}) {
  const ent = getOrCreate(user_id, product);
  if (ent.status !== "active") {
    return { ok: false, code: "entitlement_inactive" };
  }
  if (ent.used + amount > ent.quota) {
    return { ok: false, code: "quota_exceeded" };
  }
  ent.used += amount;
  const ts = new Date().toISOString();
  ent.updated_at = ts;
  const m = meta || {};
  usageStore.append({
    user_id,
    product,
    action,
    amount,
    timestamp: ts,
    market: m.market != null ? m.market : null,
    locale: m.locale != null ? m.locale : null,
    client_platform: m.client_platform != null ? m.client_platform : null,
    session_version: m.session_version != null ? m.session_version : null,
    task_id: m.task_id != null ? m.task_id : null
  });
  return {
    ok: true,
    entitlement: {
      plan: ent.plan,
      quota: ent.quota,
      used: ent.used,
      status: ent.status
    }
  };
}

module.exports = { getOrCreate, atomicConsume };
