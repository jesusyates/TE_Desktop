/**
 * Entitlement / usage 摘要：动态能力；不含身份展示字段。
 */

function toIsoOrNull(v) {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * @param {object} input
 * @param {string} [input.plan]
 * @param {Record<string, unknown>} [input.entitlements]
 * @param {Record<string, unknown>} [input.quota]
 * @param {Record<string, unknown>} [input.usage]
 * @param {Record<string, unknown>} [input.featureFlags]
 * @param {string|null} [input.updatedAt]
 * @param {string|null} [input.createdAt]
 */
function normalizeEntitlementSummary(input) {
  const i = input || {};
  const plan = i.plan != null && String(i.plan).trim() !== "" ? String(i.plan).trim() : "free";
  const entitlements =
    i.entitlements != null && typeof i.entitlements === "object" && !Array.isArray(i.entitlements)
      ? i.entitlements
      : {};
  const quota =
    i.quota != null && typeof i.quota === "object" && !Array.isArray(i.quota) ? i.quota : {};
  const usage =
    i.usage != null && typeof i.usage === "object" && !Array.isArray(i.usage) ? i.usage : {};
  const featureFlags =
    i.featureFlags != null &&
    typeof i.featureFlags === "object" &&
    !Array.isArray(i.featureFlags)
      ? i.featureFlags
      : {};

  return {
    plan,
    entitlements,
    quota,
    usage,
    featureFlags,
    updatedAt:
      toIsoOrNull(i.updatedAt) || toIsoOrNull(i.createdAt) || new Date().toISOString()
  };
}

module.exports = { normalizeEntitlementSummary };
