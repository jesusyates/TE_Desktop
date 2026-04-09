/**
 * C-5 — 允许 locale 枚举。禁止用 market 强锁语言。
 */
const ALLOWED = new Set(["zh-CN", "ja-JP", "en-US"]);

function isValidLocale(v) {
  return v != null && ALLOWED.has(String(v).trim());
}

function normalizeLocale(v) {
  const s = v == null ? "" : String(v).trim();
  return ALLOWED.has(s) ? s : null;
}

module.exports = { ALLOWED_LOCALES: ALLOWED, isValidLocale, normalizeLocale };
