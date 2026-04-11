/**
 * 用户 Settings API
 */
const { logger } = require("../../infra/logger");
const { AppError } = require("../../utils/AppError");
const { getSettingsStore } = require("../../stores/registry");
const {
  normalizeSettingsRecord,
  pickSettingsPatch,
  PATCH_WHITELIST
} = require("../../schemas/settings.schema");

/**
 * @param {import('express').Request['context']} ctx
 */
async function getSettings(ctx) {
  const store = getSettingsStore();
  return store.getByUser(ctx);
}

/**
 * @param {import('express').Request['context']} ctx
 * @param {object} body
 */
async function patchSettings(ctx, body) {
  const b = body && typeof body === "object" ? body : {};
  const unknown = Object.keys(b).filter((k) => !PATCH_WHITELIST.has(k));
  if (unknown.length) {
    throw new AppError("VALIDATION_ERROR", `Unknown fields: ${unknown.join(", ")}`, 400);
  }
  const patch = pickSettingsPatch(b);
  if (Object.keys(patch).length === 0) {
    throw new AppError("VALIDATION_ERROR", "No valid fields to update", 400);
  }
  const t0 = Date.now();
  const store = getSettingsStore();
  const merged = await store.update(ctx, patch);
  logger.info({
    event: "settings_updated",
    userId: ctx && ctx.userId != null ? String(ctx.userId) : null,
    durationMs: Date.now() - t0,
    keys: Object.keys(patch)
  });
  return merged;
}

module.exports = { getSettings, patchSettings };
