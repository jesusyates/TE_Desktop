/**
 * C-4 / C-5 — 会话域身份并入唯一 req.context（userId / platform 等标准字段）。
 */
const REQUIRED_SESSION = ["user_id", "market", "locale", "product", "client_platform"];

/**
 * @param {import('http').IncomingMessage} req
 * @returns {{ ok: true, value: object } | { ok: false, message: string }}
 */
function buildRequestContextObject(req) {
  const s = req.session;
  if (!s || typeof s !== "object") {
    return { ok: false, message: "no_session" };
  }
  for (const k of REQUIRED_SESSION) {
    const v = s[k];
    if (v == null || String(v).trim() === "") {
      return { ok: false, message: "incomplete_identity" };
    }
  }
  let entitlement = null;
  if (req.entitlement != null && typeof req.entitlement === "object") {
    entitlement = {
      plan: req.entitlement.plan,
      quota: req.entitlement.quota,
      used: req.entitlement.used
    };
  }
  return {
    ok: true,
    value: {
      userId: s.user_id,
      platform: s.client_platform,
      product: s.product,
      market: s.market,
      locale: s.locale,
      entitlement
    }
  };
}

module.exports = { buildRequestContextObject, REQUIRED_SESSION };
