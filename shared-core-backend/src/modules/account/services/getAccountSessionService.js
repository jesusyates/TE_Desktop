const { AppError } = require("../../../utils/AppError");
const { loadIdentitySources } = require("../../../stores/account/accountProfile.store");
const { normalizeAccountProfile } = require("../schemas/accountProfileSchema");

/**
 * @param {import('express').Request['context']} ctx
 */
async function getAccountSessionService(ctx) {
  if (!ctx || ctx.userId == null || String(ctx.userId).trim() === "") {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }
  const userId = String(ctx.userId).trim();
  const { local, profile } = await loadIdentitySources(userId, ctx.requestId || null);

  const email =
    (local && local.email) ||
    (profile && profile.email != null ? String(profile.email) : null) ||
    null;

  const displayName =
    (profile && profile.username != null && String(profile.username).trim() !== ""
      ? String(profile.username).trim()
      : null) ||
    null;

  const avatar =
    profile && profile.avatar_url != null && String(profile.avatar_url).trim() !== ""
      ? String(profile.avatar_url).trim()
      : null;

  const createdAt =
    (local && local.created_at) ||
    (profile && profile.created_at != null ? String(profile.created_at) : null) ||
    null;

  const market =
    (local && local.market) ||
    (profile && profile.market != null ? String(profile.market) : null) ||
    ctx.market ||
    "global";
  const locale =
    (local && local.locale) ||
    (profile && profile.locale != null ? String(profile.locale) : null) ||
    ctx.locale ||
    "en-US";

  const product = ctx.product || null;
  const platform = ctx.platform || null;

  return normalizeAccountProfile({
    userId,
    email,
    displayName,
    avatar,
    createdAt,
    market,
    locale,
    product,
    platform,
    lastLoginAt: null
  });
}

module.exports = { getAccountSessionService };
