/**
 * Identity profile：仅低频展示字段；与配额/计费解耦。
 */

function toIsoOrNull(v) {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * @param {object} input
 * @param {string} input.userId
 * @param {string|null} [input.email]
 * @param {string|null} [input.displayName]
 * @param {string|null} [input.avatar]
 * @param {string|null} [input.createdAt]
 * @param {string} [input.market]
 * @param {string} [input.locale]
 * @param {string|null} [input.product]
 * @param {string|null} [input.platform]
 * @param {string|null} [input.lastLoginAt]
 */
function normalizeAccountProfile(input) {
  const i = input || {};
  const userId = i.userId != null ? String(i.userId).trim() : "";
  return {
    userId,
    email: i.email != null && String(i.email).trim() !== "" ? String(i.email).trim() : null,
    displayName:
      i.displayName != null && String(i.displayName).trim() !== ""
        ? String(i.displayName).trim()
        : null,
    avatar: i.avatar != null && String(i.avatar).trim() !== "" ? String(i.avatar).trim() : null,
    createdAt: toIsoOrNull(i.createdAt),
    market:
      i.market != null && String(i.market).trim() !== ""
        ? String(i.market).trim().toLowerCase()
        : "global",
    locale:
      i.locale != null && String(i.locale).trim() !== ""
        ? String(i.locale).trim()
        : "en-US",
    product:
      i.product != null && String(i.product).trim() !== ""
        ? String(i.product).trim().toLowerCase()
        : "aics",
    platform:
      i.platform != null && String(i.platform).trim() !== ""
        ? String(i.platform).trim().toLowerCase()
        : null,
    lastLoginAt: toIsoOrNull(i.lastLoginAt)
  };
}

module.exports = { normalizeAccountProfile };
