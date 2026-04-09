/**
 * C-3 / C-8 — Entitlement 核心（quota + usage 一致；单一模型）。
 * 禁止：多计费模型并行；在 handler 内直接改 store；usage 与 task 身份分裂。
 */
const entitlementStore = require("./entitlement.store");
const { billingLog } = require("./billing.log");

/**
 * @returns {{ user_id, product, plan, quota, used, status }}
 */
function getEntitlement(user_id, product) {
  return entitlementStore.getOrCreate(user_id, product);
}

/**
 * 校验并扣减 quota，写入 usage_event。
 * @returns {{ ok: true, entitlement: object } | { ok: false, code: string }}
 */
/**
 * @param {object} [usageMeta] — C-8：task_id, market, locale, client_platform, session_version
 */
function applyUsage(user_id, product, action, amount, usageMeta = {}) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0 || !Number.isInteger(amt)) {
    return { ok: false, code: "invalid_amount" };
  }
  const r = entitlementStore.atomicConsume(user_id, product, action, amt, usageMeta || {});
  if (r.ok) {
    const ts = new Date().toISOString();
    billingLog({ event: "usage_recorded", user_id, product, amount: amt, timestamp: ts });
  }
  return r;
}

/**
 * 任务入口：默认 task_run，amount 由 middleware 传入（默认 1）。
 * @param {object} [usageMeta] — C-8
 */
function checkAndConsume(user_id, product, amount, usageMeta = {}) {
  const r = applyUsage(user_id, product, "task_run", amount, usageMeta);
  const ts = new Date().toISOString();
  if (r.ok) {
    billingLog({ event: "entitlement_check_pass", user_id, product, amount, timestamp: ts });
  } else {
    billingLog({ event: "entitlement_check_fail", user_id, product, amount, timestamp: ts });
  }
  return r;
}

module.exports = { getEntitlement, checkAndConsume, applyUsage };
