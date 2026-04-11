/**
 * Feature flags（解析上下文）
 */
const { getFeatureFlagStore } = require("../../stores/registry");
const { sanitizeFlags, FLAG_KEYS } = require("../../stores/featureFlag/featureFlag.store");

/**
 * @param {import('express').Request['context']} ctx
 */
async function resolveFlags(ctx) {
  const store = getFeatureFlagStore();
  return store.resolveFlags(ctx);
}

/**
 * @param {import('express').Request['context']} ctx
 */
async function getOverridesForApi(ctx) {
  const store = getFeatureFlagStore();
  const ov = await store.getByUser(ctx);
  return { overrides: ov, keys: FLAG_KEYS };
}

/**
 * 内部：更新用户覆盖（可选供管理接口使用）
 * @param {import('express').Request['context']} ctx
 * @param {object} flags
 */
async function updateOverrides(ctx, flags) {
  const store = getFeatureFlagStore();
  return store.update(ctx, sanitizeFlags(flags));
}

module.exports = { resolveFlags, getOverridesForApi, updateOverrides };
