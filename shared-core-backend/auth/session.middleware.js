/**
 * C-2 / C-5 / C-6 — product/_client_platform 仅来自 Header；identity 由 Shared Core 裁定。
 * AUTH_PROVIDER=supabase 时：Bearer 为 GoTrue access JWT，须经 Supabase auth.getUser 校验（异步）。
 */
const { verifyAccessToken } = require("./auth.handlers");
const { config } = require("../src/infra/config");
const { getSupabaseAdminClient } = require("../src/infra/supabase/client");
const { getProfileByUserId } = require("../src/services/v1/profiles.service");
const { parseClientHeaders, pickHeader } = require("./client-meta.util");
const preferencesService = require("../preferences/preferences.service");
const preferencesSync = require("../preferences/preferences-sync.service");
const { sessionLog } = require("./session.log");

function readBearer(authHeader) {
  if (!authHeader || typeof authHeader !== "string") return null;
  const m = authHeader.match(/^\s*Bearer\s+(.+)\s*$/i);
  return m ? m[1].trim() : null;
}

function resolveSession(req) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) return null;

  const authHeader = pickHeader(req, "authorization");
  const token = readBearer(authHeader);
  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      const eff = preferencesService.resolveForSession(
        payload.user_id,
        payload.market,
        payload.locale,
        req.headers
      );
      const tokenSv = Number(payload.session_version);
      const currentSv = preferencesSync.getCurrentSessionVersion(payload.user_id);
      req.sessionRefreshRecommended =
        Number.isInteger(tokenSv) && Number.isInteger(currentSv) && tokenSv < currentSv;
      if (req.sessionRefreshRecommended) {
        sessionLog({
          event: "stale_session_detected",
          user_id: payload.user_id,
          market: eff.market,
          locale: eff.locale,
          product: meta.product,
          client_platform: meta.client_platform,
          token_session_version: tokenSv,
          current_session_version: currentSv
        });
      }
      req.session = {
        user_id: payload.user_id,
        market: eff.market,
        locale: eff.locale,
        product: meta.product,
        client_platform: meta.client_platform
      };
      return req.session;
    }
  }

  /**
   * MODULE C-5：显式 dev 兼容（SHARED_CORE_HEADER_IDENTITY_FALLBACK=1）— 无合法 Bearer 时方读 x-aics-*；
   * 不得覆盖已成功的 JWT 路径。正式环境勿开启。
   */
  if (process.env.SHARED_CORE_HEADER_IDENTITY_FALLBACK === "1") {
    const authRepository = require("./auth.repository");
    const hdrUser = pickHeader(req, "x-aics-user-id");
    const hdrClient = pickHeader(req, "x-aics-client-id");
    const uid = hdrUser != null ? String(hdrUser).trim() : "";
    const cid = hdrClient != null ? String(hdrClient).trim() : "";
    if (uid && cid) {
      if (uid === "guest-user") {
        req.sessionRefreshRecommended = false;
        req.session = {
          user_id: "guest-user",
          market: "global",
          locale: "en-US",
          product: meta.product,
          client_platform: meta.client_platform
        };
        return req.session;
      }
      const userRaw = authRepository.findUserById(uid);
      if (userRaw) {
        const user = preferencesService.prepareUserForToken(userRaw);
        req.sessionRefreshRecommended = false;
        req.session = {
          user_id: user.user_id,
          market: user.market,
          locale: user.locale,
          product: meta.product,
          client_platform: meta.client_platform
        };
        return req.session;
      }
    }
  }

  return null;
}

/**
 * @returns {Promise<typeof req.session | null>}
 */
async function resolveSessionAsync(req) {
  const c = config();
  if (c.authProvider !== "supabase") {
    return resolveSession(req);
  }
  const meta = parseClientHeaders(req);
  if ("error" in meta) return null;

  const authHeader = pickHeader(req, "authorization");
  const token = readBearer(authHeader);
  if (!token) {
    if (process.env.SHARED_CORE_HEADER_IDENTITY_FALLBACK === "1") {
      return resolveSession(req);
    }
    return null;
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  const uid = data.user.id;
  const profile = await getProfileByUserId(uid);
  const marketRaw = profile?.market || data.user.user_metadata?.market || "global";
  const localeRaw = profile?.locale || data.user.user_metadata?.locale || "en";

  const eff = preferencesService.resolveForSession(uid, marketRaw, localeRaw, req.headers);

  req.sessionRefreshRecommended = false;

  req.session = {
    user_id: uid,
    market: eff.market,
    locale: eff.locale,
    product: meta.product,
    client_platform: meta.client_platform
  };
  return req.session;
}

function readBearerFromReq(req) {
  return readBearer(pickHeader(req, "authorization"));
}

module.exports = { resolveSession, resolveSessionAsync, readBearer, readBearerFromReq, pickHeader };
