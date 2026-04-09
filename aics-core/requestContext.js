/**
 * MODULE C-5 — Route 层统一 request context（AI Core HTTP）。
 * 优先级：Authorization Bearer / x-aics-session-token（JWT 形态）> x-aics-user-id + x-aics-client-id。
 * 正式 JWT 存在时 userId 仅以载荷为准，不信任冲突的 x-aics-user-id。
 *
 * AICS_IDENTITY_DEV_FALLBACK：非 "0" 时，缺省仍回落 dev-user/desktop-dev（兼容旧客户端与 smoke）。
 */
const path = require("path");
const { verifyJwt } = require(path.join(__dirname, "..", "shared-core-backend", "auth", "jwt.util"));

const DEFAULT_USER_ID = "dev-user";
const DEFAULT_CLIENT_ID = "desktop-dev";

function headerFirst(req, lowerName) {
  const h = req.headers || {};
  const v = h[lowerName];
  if (v != null && String(v).trim() !== "") return String(v).trim();
  const alt = Object.keys(h).find((k) => k.toLowerCase() === lowerName);
  if (alt && h[alt] != null && String(h[alt]).trim() !== "") return String(h[alt]).trim();
  return "";
}

function readBearerFromReq(req) {
  const auth = headerFirst(req, "authorization");
  if (!auth) return "";
  const m = auth.match(/^\s*Bearer\s+(.+)\s*$/i);
  return m ? m[1].trim() : "";
}

function getAuthSecret() {
  const s = process.env.SHARED_CORE_AUTH_SECRET || process.env.AUTH_SECRET;
  return s && String(s).length >= 16 ? String(s) : null;
}

function isValidAccessPayload(p) {
  if (!p || typeof p !== "object") return false;
  for (const k of ["user_id", "market", "locale", "product", "client_platform"]) {
    const v = p[k];
    if (v == null || typeof v !== "string" || !String(v).trim()) return false;
  }
  const sv = p.session_version;
  if (!Number.isInteger(sv) || sv < 1) return false;
  return true;
}

function verifyAccessPayload(token, secret) {
  if (!token || !secret) return null;
  const p = verifyJwt(token, secret);
  if (!isValidAccessPayload(p)) return null;
  return p;
}

/**
 * @returns {{
 *   userId: string;
 *   clientId: string;
 *   sessionToken?: string;
 *   identitySource: "bearer" | "headers" | "dev_fallback";
 *   isFallbackIdentity: boolean;
 *   clientAuthMode?: string;
 * }}
 */
function buildRouteContext(req) {
  const clientRaw = headerFirst(req, "x-aics-client-id");
  const userRaw = headerFirst(req, "x-aics-user-id");
  const tokenHdr = headerFirst(req, "x-aics-session-token");
  const authModeRaw = headerFirst(req, "x-aics-auth-mode");

  const secret = getAuthSecret();
  const bearer = readBearerFromReq(req);

  let userId = "";
  let clientId = "";
  let sessionToken;
  let identitySource = "headers";

  let payload = null;
  let tokenUsed = "";
  if (bearer && secret) {
    payload = verifyAccessPayload(bearer, secret);
    if (!payload) {
      return {
        userId: "",
        clientId: "",
        identitySource: "invalid_bearer",
        isFallbackIdentity: false
      };
    }
    tokenUsed = bearer;
  }
  if (!payload && secret && tokenHdr && tokenHdr.includes(".")) {
    payload = verifyAccessPayload(tokenHdr, secret);
    if (payload) tokenUsed = tokenHdr;
  }

  if (payload) {
    identitySource = "bearer";
    userId = String(payload.user_id).trim();
    sessionToken = tokenUsed;
    clientId = (
      clientRaw ||
      `desktop-${String(payload.client_platform || "desktop").trim() || "desktop"}`
    ).trim();
  } else {
    userId = userRaw ? String(userRaw).trim() : "";
    clientId = clientRaw ? String(clientRaw).trim() : "";
    if (tokenHdr) sessionToken = tokenHdr;
  }

  const hadHeaderPair = userRaw !== "" && clientRaw !== "";
  let isFallbackIdentity = identitySource === "headers" && !hadHeaderPair;

  const allowDev = process.env.AICS_IDENTITY_DEV_FALLBACK !== "0";
  if ((!userId || !clientId) && allowDev) {
    identitySource = "dev_fallback";
    if (!userId) userId = DEFAULT_USER_ID;
    if (!clientId) clientId = DEFAULT_CLIENT_ID;
    isFallbackIdentity = true;
  } else if (!userId || !clientId) {
    isFallbackIdentity = true;
  }

  const clientAuthMode = authModeRaw || (isFallbackIdentity ? "fallback" : undefined);

  return {
    userId,
    clientId,
    ...(sessionToken ? { sessionToken } : {}),
    identitySource,
    isFallbackIdentity,
    ...(clientAuthMode ? { clientAuthMode } : {})
  };
}

function identityWriteFields(ctx) {
  const { normalizeIdentityWrite } = require("./schema/identityFields");
  return normalizeIdentityWrite(ctx);
}

function parseRequestIdentity(req) {
  return buildRouteContext(req);
}

module.exports = {
  buildRouteContext,
  parseRequestIdentity,
  identityWriteFields,
  DEFAULT_USER_ID,
  DEFAULT_CLIENT_ID
};
