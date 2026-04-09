/**
 * C-5 / C-6 — GET/PUT /preferences/me；PUT 成功后 bump session_version。禁止 body 携带 user_id。
 * 禁止：preference 保存后仅靠旧 token 传播；客户端自管 session_version。
 */
const authRepository = require("../auth/auth.repository");
const preferencesService = require("./preferences.service");
const preferencesSync = require("./preferences-sync.service");
const { preferenceLog } = require("./preferences.log");

function handleGetPreferencesMe(req) {
  const userId = req.context.userId;
  const row = preferencesService.findPreference(userId);
  if (row) {
    preferenceLog({
      event: "preference_read",
      user_id: userId,
      market: row.market,
      locale: row.locale,
      source: row.source
    });
    return {
      status: 200,
      body: {
        user_id: row.user_id,
        market: row.market,
        locale: row.locale,
        updated_at: row.updated_at,
        source: row.source
      }
    };
  }
  const user = authRepository.findUserById(userId);
  const n = preferencesService.normalizePair(user?.market, user?.locale);
  return {
    status: 200,
    body: {
      user_id: userId,
      market: n.market,
      locale: n.locale,
      updated_at: null,
      source: "account_default"
    }
  };
}

function handlePutPreferencesMe(req, body) {
  const userId = req.context.userId;
  const market = body && body.market;
  const locale = body && body.locale;
  if (
    market == null ||
    locale == null ||
    String(market).trim() === "" ||
    String(locale).trim() === ""
  ) {
    return { status: 400, body: { message: "market_and_locale_required" } };
  }
  const r = preferencesService.upsertManual(userId, market, locale);
  if (!r.ok) {
    return { status: 400, body: { message: "invalid_market_or_locale" } };
  }
  preferencesSync.bumpSessionVersion(userId, {
    market: r.row.market,
    locale: r.row.locale,
    product: req.context && req.context.product,
    client_platform: req.context && req.context.platform
  });
  return {
    status: 200,
    body: {
      user_id: r.row.user_id,
      market: r.row.market,
      locale: r.row.locale,
      updated_at: r.row.updated_at,
      source: "manual"
    }
  };
}

module.exports = { handleGetPreferencesMe, handlePutPreferencesMe };
