/**
 * 用户 Settings */
const { config } = require("../infra/config");

function defaultSettingsRecord(userId) {
  const c = config();
  const uid = userId != null ? String(userId).trim() : "anonymous";
  return {
    userId: uid,
    defaultModel: String(c.aiModelDefault || "gpt-4o-mini"),
    autoWriteMemory: true,
    allowAI: true,
    preferredLanguage: String(c.defaultLocale || "en-US"),
    updatedAt: new Date().toISOString()
  };
}

/**
 * @param {object|null} row
 * @param {string} userId
 */
function normalizeSettingsRecord(row, userId) {
  const base = defaultSettingsRecord(userId);
  if (!row || typeof row !== "object") return base;
  return {
    userId: row.user_id != null ? String(row.user_id) : row.userId != null ? String(row.userId) : base.userId,
    defaultModel:
      row.defaultModel != null
        ? String(row.defaultModel).slice(0, 128)
        : row.default_model != null
          ? String(row.default_model).slice(0, 128)
          : base.defaultModel,
    autoWriteMemory:
      row.autoWriteMemory === false || row.auto_write_memory === false || row.autoWriteMemory === 0
        ? false
        : row.autoWriteMemory === true ||
 row.auto_write_memory === true ||
            row.autoWriteMemory === 1
          ? true
          : base.autoWriteMemory,
    allowAI:
      row.allowAI === false || row.allow_ai === false || row.allowAI === 0
        ? false
        : row.allowAI === true || row.allow_ai === true || row.allowAI === 1
          ? true
          : base.allowAI,
    preferredLanguage:
      row.preferredLanguage != null
        ? String(row.preferredLanguage).slice(0, 32)
        : row.preferred_language != null
          ? String(row.preferred_language).slice(0, 32)
          : base.preferredLanguage,
    updatedAt:
      row.updatedAt != null
        ? String(row.updatedAt)
        : row.updated_at != null
          ? String(row.updated_at)
          : base.updatedAt
  };
}

const PATCH_WHITELIST = new Set([
  "defaultModel",
  "autoWriteMemory",
  "allowAI",
  "preferredLanguage"
]);

/**
 * @param {object} body
 */
function pickSettingsPatch(body) {
  const b = body && typeof body === "object" ? body : {};
  const out = {};
  if (b.defaultModel !== undefined) {
    out.defaultModel = String(b.defaultModel).slice(0, 128);
  }
  if (b.autoWriteMemory !== undefined) {
    out.autoWriteMemory = Boolean(b.autoWriteMemory);
  }
  if (b.allowAI !== undefined) {
    out.allowAI = Boolean(b.allowAI);
  }
  if (b.preferredLanguage !== undefined) {
    out.preferredLanguage = String(b.preferredLanguage).slice(0, 32);
  }
  return out;
}

module.exports = {
  defaultSettingsRecord,
  normalizeSettingsRecord,
  pickSettingsPatch,
  PATCH_WHITELIST
};
