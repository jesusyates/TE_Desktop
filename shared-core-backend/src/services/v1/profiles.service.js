/**
 * public.profiles — 业务用户扩展（经 user.adapter；禁止在此直引 Supabase SDK）。
 */
const userAdapter = require("../../infra/supabase/adapters/user.adapter");
const { isSupabaseConfigured } = require("../../infra/supabase/client");

/**
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function getProfileByUserId(userId) {
  const id = userId != null ? String(userId).trim() : "";
  if (!id || !isSupabaseConfigured()) return null;
  try {
    return await userAdapter.fetchProfile(id);
  } catch {
    return null;
  }
}

/**
 * 注册兜底：trigger 未跑通或竞态时补齐一行（on conflict 安全）。
 */
async function ensureProfileRow(userId, email, market, locale) {
  const id = userId != null ? String(userId).trim() : "";
  if (!id || !isSupabaseConfigured()) return false;
  const row = {
    id,
    email: email != null ? String(email).trim() : null,
    market: market != null && String(market).trim() ? String(market).trim().toLowerCase() : "global",
    locale: locale != null && String(locale).trim() ? String(locale).trim() : "en"
  };
  try {
    return await userAdapter.upsertProfile(row);
  } catch {
    return false;
  }
}

/**
 * 登录/me 外显资料（不含敏感列）。
 * @param {Record<string, unknown> | null} profile
 */
function formatPublicProfile(profile) {
  const p = profile || {};
  return {
    market: p.market != null ? String(p.market) : "global",
    locale: p.locale != null ? String(p.locale) : "en",
    username: p.username != null ? String(p.username) : null,
    avatar_url: p.avatar_url != null ? String(p.avatar_url) : null,
    backup_email: p.backup_email != null ? String(p.backup_email) : null,
    phone_backup: p.phone_backup != null ? String(p.phone_backup) : null,
    mfa_enabled: Boolean(p.mfa_enabled)
  };
}

module.exports = { getProfileByUserId, ensureProfileRow, formatPublicProfile };
