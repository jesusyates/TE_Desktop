/**
 * 唯一标准 request context 定义与装配（单一入口）。
 *
 * 生产：客户端须带齐 X-Client-Product / X-Client-Platform（/v1 另有中间件强校验）。
 * 开发：若缺少且配置了 DEFAULT_CLIENT_PRODUCT / DEFAULT_CLIENT_PLATFORM 则兜底；否则保持 null。
 */
const { randomUUID } = require("crypto");
const { config } = require("../infra/config");
const { resolveSession } = require("../../auth/session.middleware");

function pickHeader(req, name) {
  const v = req.get ? req.get(name) : req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function parseBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== "string") return null;
  const m = authHeader.match(/^\s*Bearer\s+(.+)\s*$/i);
  return m ? m[1].trim() : null;
}

function resolveClientIp(req) {
  if (req.ip) return String(req.ip);
  const xf = pickHeader(req, "x-forwarded-for");
  if (xf) return String(xf).split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : "";
}

/**
 * @returns {import('express').Request['context']}
 */
function createEmptyContext() {
  return {
    requestId: randomUUID(),
    userId: null,
    clientId: null,
    sessionToken: null,
    platform: null,
    product: null,
    market: null,
    locale: null,
    version: null,
    ip: "",
    userAgent: null,
    entitlement: null,
    /** @internal 计费中间件等仍可写 req.entitlement，finalize 时同步 */
    _sessionResolved: false
  };
}

function normalizeContext(req, ctx) {
  const c = config();
  const clientIdRaw = pickHeader(req, "x-client-id");
  ctx.clientId =
    clientIdRaw != null && String(clientIdRaw).trim() !== ""
      ? String(clientIdRaw).trim()
      : `anon-${ctx.requestId.slice(0, 8)}`;

  ctx.sessionToken = parseBearerToken(pickHeader(req, "authorization"));
  ctx.ip = resolveClientIp(req);
  ctx.userAgent = pickHeader(req, "user-agent") || null;

  let product = pickHeader(req, "x-client-product") || pickHeader(req, "x-product");
  let platform = pickHeader(req, "x-client-platform");
  if (c.nodeEnv !== "production") {
    if (!product && c.defaultProduct) product = c.defaultProduct;
    if (!platform && c.defaultPlatform) platform = c.defaultPlatform;
  }
  ctx.product = product != null ? String(product).trim().toLowerCase() || null : null;
  ctx.platform = platform != null ? String(platform).trim().toLowerCase() || null : null;

  ctx.market = pickHeader(req, "x-client-market") || c.defaultMarket;
  ctx.locale = pickHeader(req, "x-client-locale") || c.defaultLocale;
  ctx.version = pickHeader(req, "x-client-version") || null;

  if (ctx.market) ctx.market = String(ctx.market).trim();
  if (ctx.locale) ctx.locale = String(ctx.locale).trim();
}

function applySessionToContext(req, ctx) {
  resolveSession(req);
  if (!req.session || typeof req.session !== "object") return;
  ctx.userId = req.session.user_id;
  ctx.market = req.session.market;
  ctx.locale = req.session.locale;
  ctx.product = req.session.product;
  ctx.platform = req.session.client_platform;
  ctx._sessionResolved = true;
}

function syncEntitlementFromReq(req, ctx) {
  if (req.entitlement != null && typeof req.entitlement === "object") {
    ctx.entitlement = {
      plan: req.entitlement.plan,
      quota: req.entitlement.quota,
      used: req.entitlement.used
    };
  }
}

module.exports = {
  createEmptyContext,
  normalizeContext,
  applySessionToContext,
  syncEntitlementFromReq,
  parseBearerToken
};
