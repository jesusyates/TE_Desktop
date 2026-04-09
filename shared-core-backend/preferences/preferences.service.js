/**
 * C-5 — market/locale 优先级：手动 > 账号偏好 > 本地缓存头 > Geo 提示 > JWT 载体 > global/en-US。
 * 禁止：登录后以客户端本地为权威；IP 「锁定」国家/语言；Web/Desktop 分裂 preference 逻辑。
 */
const authRepository = require("../auth/auth.repository");
const { normalizeMarket, isValidMarket } = require("../config/market.config");
const { normalizeLocale, isValidLocale } = require("../config/locale.config");
const repo = require("./preferences.repository");
const { preferenceLog } = require("./preferences.log");

const FALLBACK_MARKET = "global";
const FALLBACK_LOCALE = "en-US";

function pickHeader(headers, name) {
  if (!headers || typeof headers !== "object") return null;
  const v = headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function normalizePair(market, locale) {
  const m = normalizeMarket(market) || FALLBACK_MARKET;
  const l = normalizeLocale(locale) || FALLBACK_LOCALE;
  return { market: m, locale: l };
}

function resolveGeoHint(headers) {
  const raw = pickHeader(headers, "cf-ipcountry") || pickHeader(headers, "x-debug-geo-market");
  if (raw == null || String(raw).trim() === "") return null;
  const code = String(raw).trim().toUpperCase();
  if (code === "CN") return { market: "cn", locale: "zh-CN" };
  if (code === "JP") return { market: "jp", locale: "ja-JP" };
  return { market: "global", locale: "en-US" };
}

/**
 * 登录/签发 token 前：preference 存在则覆盖 user 行；否则写回 account_default 行并规范化。
 */
function prepareUserForToken(user) {
  const existing = repo.findByUserId(user.user_id);
  if (existing) {
    preferenceLog({
      event: "preference_read",
      user_id: user.user_id,
      market: existing.market,
      locale: existing.locale,
      source: existing.source
    });
    return {
      ...user,
      market: existing.market,
      locale: existing.locale
    };
  }
  const { market, locale } = normalizePair(user.market, user.locale);
  const row = {
    user_id: user.user_id,
    market,
    locale,
    updated_at: new Date().toISOString(),
    source: "account_default"
  };
  repo.upsert(row);
  preferenceLog({
    event: "preference_applied_on_login",
    user_id: user.user_id,
    market,
    locale,
    source: "account_default"
  });
  return { ...user, market, locale };
}

/**
 * 已鉴权请求：store 中 preference 优先于 JWT / 本地头 / Geo（手动与账号均来自同表，已持久化即优先）。
 * 无 preference 行时：本地缓存头 > Geo > JWT > 兜底（与优先级 3–5 一致）。
 */
function resolveEffectiveMarketLocale(userId, jwtMarket, jwtLocale, headers) {
  headers = headers || {};
  const pref = repo.findByUserId(userId);
  if (pref) {
    return { market: pref.market, locale: pref.locale, source: pref.source, _hadPref: true };
  }
  const cacheM = pickHeader(headers, "x-client-preference-market");
  const cacheL = pickHeader(headers, "x-client-preference-locale");
  if (isValidMarket(cacheM) && isValidLocale(cacheL)) {
    return {
      market: String(cacheM).trim().toLowerCase(),
      locale: String(cacheL).trim(),
      source: "local_cache_sync",
      _hadPref: false
    };
  }
  const geo = resolveGeoHint(headers);
  if (geo) {
    return { market: geo.market, locale: geo.locale, source: "geo_default", _hadPref: false };
  }
  const jm = normalizeMarket(jwtMarket);
  const jl = normalizeLocale(jwtLocale);
  if (jm && jl) {
    return { market: jm, locale: jl, source: "account_default", _hadPref: false };
  }
  return {
    market: FALLBACK_MARKET,
    locale: FALLBACK_LOCALE,
    source: "fallback_default",
    _hadPref: false
  };
}

function resolveForSession(userId, jwtMarket, jwtLocale, headers) {
  const r = resolveEffectiveMarketLocale(userId, jwtMarket, jwtLocale, headers);
  if (r._hadPref) {
    preferenceLog({
      event: "preference_read",
      user_id: userId,
      market: r.market,
      locale: r.locale,
      source: r.source
    });
  }
  const { _hadPref, ...out } = r;
  return out;
}

/** /auth/me：与 session 相同解析，并打 applied_on_me */
function resolveForMe(userId, jwtMarket, jwtLocale, headers) {
  const r = resolveEffectiveMarketLocale(userId, jwtMarket, jwtLocale, headers);
  const { _hadPref, ...eff } = r;
  preferenceLog({
    event: "preference_applied_on_me",
    user_id: userId,
    market: eff.market,
    locale: eff.locale,
    source: eff.source
  });
  return eff;
}

function upsertManual(userId, market, locale) {
  const m = normalizeMarket(market);
  const l = normalizeLocale(locale);
  if (!m || !l) return { ok: false };
  const row = {
    user_id: userId,
    market: m,
    locale: l,
    updated_at: new Date().toISOString(),
    source: "manual"
  };
  repo.upsert(row);
  preferenceLog({
    event: "preference_updated",
    user_id: userId,
    market: m,
    locale: l,
    source: "manual"
  });
  return { ok: true, row };
}

function findPreference(userId) {
  return repo.findByUserId(userId);
}

module.exports = {
  prepareUserForToken,
  resolveForSession,
  resolveForMe,
  upsertManual,
  normalizePair,
  findPreference
};
