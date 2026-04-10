/**
 * Supabase Auth（GoTrue）服务端封装：password / refresh grant；禁止客户端持有 service_role。
 */
const { config } = require("../../infra/config");
const { getSupabaseAdminClient } = require("../../infra/supabase/client");

/**
 * @param {string} pathSuffix e.g. '/auth/v1/token?grant_type=password'
 */
function gotrueUrl(pathSuffix) {
  const c = config();
  const base = String(c.supabaseUrl || "").replace(/\/+$/, "");
  return `${base}${pathSuffix.startsWith("/") ? "" : "/"}${pathSuffix}`;
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

/**
 * @returns {Promise<{ access_token?: string, refresh_token?: string, expires_in?: number, user?: object, error?: string, error_code?: string }>}
 */
async function signInWithPassword(email, password) {
  const c = config();
  const anon = c.supabaseAnonKey;
  if (!anon) return { error: "supabase_anon_missing" };
  const url = gotrueUrl("/auth/v1/token?grant_type=password");
  const { ok, status, json } = await postJson(
    url,
    { apikey: anon, Authorization: `Bearer ${anon}` },
    { email, password }
  );
  if (!ok || !json) {
    const msg =
      json && typeof json === "object" && json.msg != null
        ? String(json.msg)
        : json && typeof json === "object" && json.error_description
          ? String(json.error_description)
          : `gotrue_password_${status}`;
    const code = json && typeof json === "object" && json.error ? String(json.error) : "";
    return { error: msg, error_code: code, http_status: status };
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
    user: json.user
  };
}

/**
 * @returns {Promise<{ access_token?: string, refresh_token?: string, error?: string, error_code?: string }>}
 */
async function refreshSession(refreshToken) {
  const c = config();
  const anon = c.supabaseAnonKey;
  if (!anon) return { error: "supabase_anon_missing" };
  const url = gotrueUrl("/auth/v1/token?grant_type=refresh_token");
  const { ok, status, json } = await postJson(
    url,
    { apikey: anon, Authorization: `Bearer ${anon}` },
    { refresh_token: refreshToken }
  );
  if (!ok || !json) {
    const msg =
      json && typeof json === "object" && json.msg != null
        ? String(json.msg)
        : `gotrue_refresh_${status}`;
    const code = json && typeof json === "object" && json.error ? String(json.error) : "";
    return { error: msg, error_code: code };
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || refreshToken,
    user: json.user
  };
}

/**
 * 正式环境必须由用户完成邮箱验证；禁止服务端 auto-confirm 作为上线策略。
 * @returns {Promise<{ user?: import('@supabase/supabase-js').User, error?: string }>}
 */
async function adminCreateUser(email, password, userMeta) {
  const admin = getSupabaseAdminClient();
  if (!admin) return { error: "supabase_admin_missing" };
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: userMeta || {}
  });
  if (error) return { error: error.message || String(error) };
  return { user: data.user };
}

/**
 * @returns {Promise<{ user?: import('@supabase/supabase-js').User, error?: string }>}
 */
async function getUserFromAccessToken(accessToken) {
  const admin = getSupabaseAdminClient();
  if (!admin) return { error: "supabase_admin_missing" };
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data?.user) return { error: error ? error.message : "invalid_token" };
  return { user: data.user };
}

module.exports = {
  signInWithPassword,
  refreshSession,
  adminCreateUser,
  getUserFromAccessToken
};
