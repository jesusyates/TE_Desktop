/**
 * C-6 — req.context / auth/me 身份断言（唯一 context：userId / platform）。
 */
const { isValidMarket } = require("../config/market.config");
const { isValidLocale } = require("../config/locale.config");
const { contextLog } = require("./context.log");

function baseFields(userId, market, locale, product, platform) {
  return { user_id: userId, market, locale, product, client_platform: platform };
}

/**
 * /auth/me 返回前校验
 * @returns {{ ok: true } | { ok: false }}
 */
function assertAuthMeUser(user) {
  const u = user || {};
  const ok =
    u.user_id &&
    isValidMarket(u.market) &&
    isValidLocale(u.locale) &&
    u.product &&
    String(u.product).trim() &&
    u.client_platform &&
    String(u.client_platform).trim();

  if (!ok) {
    contextLog({
      event: "auth_me_context_invalid",
      user_id: u.user_id || null,
      market: u.market || null,
      locale: u.locale || null,
      product: u.product || null,
      client_platform: u.client_platform || null
    });
    return { ok: false };
  }
  return { ok: true };
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {{ requireEntitlement?: boolean }} opts
 */
function assertRequestContext(req, opts) {
  const ctx = req && req.context;
  const needEnt = opts && opts.requireEntitlement;
  if (!ctx) {
    contextLog({
      event: "context_assert_fail",
      user_id: null,
      market: null,
      locale: null,
      product: null,
      client_platform: null
    });
    return false;
  }
  let ok =
    ctx.userId &&
    isValidMarket(ctx.market) &&
    isValidLocale(ctx.locale) &&
    ctx.product &&
    String(ctx.product).trim() &&
    ctx.platform &&
    String(ctx.platform).trim();

  if (ok && needEnt) {
    const e = ctx.entitlement;
    ok =
      e &&
      e.plan != null &&
      String(e.plan).trim() !== "" &&
      typeof e.quota === "number" &&
      typeof e.used === "number";
  }

  if (!ok) {
    contextLog({
      event: "context_assert_fail",
      user_id: ctx.userId || null,
      market: ctx.market || null,
      locale: ctx.locale || null,
      product: ctx.product || null,
      client_platform: ctx.platform || null
    });
    return false;
  }
  contextLog({
    event: "context_assert_pass",
    user_id: ctx.userId,
    market: ctx.market,
    locale: ctx.locale,
    product: ctx.product,
    client_platform: ctx.platform
  });
  return true;
}

/** generateStepResult 等仅持 requestContext 对象时 */
function assertGenerateContext(requestContext) {
  const ctx = requestContext || {};
  const ok =
    ctx.userId &&
    isValidMarket(ctx.market) &&
    isValidLocale(ctx.locale) &&
    ctx.product &&
    String(ctx.product).trim() &&
    ctx.platform &&
    String(ctx.platform).trim();
  if (!ok) {
    contextLog({
      event: "context_assert_fail",
      user_id: ctx.userId || null,
      market: ctx.market || null,
      locale: ctx.locale || null,
      product: ctx.product || null,
      client_platform: ctx.platform || null
    });
    return false;
  }
  contextLog({
    event: "context_assert_pass",
    user_id: ctx.userId,
    market: ctx.market,
    locale: ctx.locale,
    product: ctx.product,
    client_platform: ctx.platform
  });
  return true;
}

module.exports = { assertAuthMeUser, assertRequestContext, assertGenerateContext, baseFields };
