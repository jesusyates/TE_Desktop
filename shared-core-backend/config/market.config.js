/**
 * C-5 — 允许 market 枚举。禁止用 locale 反推 market；market 与 locale 解耦。
 */
const ALLOWED = new Set(["cn", "jp", "global"]);

function isValidMarket(v) {
  return v != null && ALLOWED.has(String(v).trim().toLowerCase());
}

function normalizeMarket(v) {
  const s = v == null ? "" : String(v).trim().toLowerCase();
  return ALLOWED.has(s) ? s : null;
}

module.exports = { ALLOWED_MARKETS: ALLOWED, isValidMarket, normalizeMarket };
