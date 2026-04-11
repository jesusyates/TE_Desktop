/**
 * Supabase Auth（GoTrue）服务端封装：password / refresh grant；禁止客户端持有 service_role。
 */
const { config } = require("../../infra/config");
const { getSupabaseAdminClient } = require("../../infra/supabase/client");
const { authLog } = require("../../../auth/auth.log");

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

function nonEmptyUserId(obj) {
  if (obj == null || typeof obj !== "object") return null;
  const id = obj.id;
  if (id == null) return null;
  const s = String(id).trim();
  return s.length > 0 ? s : null;
}

/**
 * GoTrue /auth/v1/signup 200 体可能是嵌套 { user }，也可能是直连用户对象（顶层含 id/email）。
 * @returns {{ user: object|null, parseBranch: string, keys: string[] }}
 */
function pickSignupUserPayload(json) {
  const keys = json && typeof json === "object" ? Object.keys(json) : [];
  if (!json || typeof json !== "object") {
    return { user: null, parseBranch: "none", keys };
  }
  if (nonEmptyUserId(json.user)) {
    return { user: json.user, parseBranch: "response.user", keys };
  }
  const dataUser = json.data != null && typeof json.data === "object" ? json.data.user : null;
  if (nonEmptyUserId(dataUser)) {
    return { user: dataUser, parseBranch: "response.data.user", keys };
  }
  const data = json.data != null && typeof json.data === "object" ? json.data : null;
  if (data && nonEmptyUserId(data) && !nonEmptyUserId(data.user)) {
    return { user: data, parseBranch: "response.data", keys };
  }
  if (nonEmptyUserId(json)) {
    return { user: json, parseBranch: "response.root", keys };
  }
  return { user: null, parseBranch: "none", keys };
}

function pickSignupSession(json) {
  if (!json || typeof json !== "object") return null;
  if (json.access_token && json.refresh_token) {
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_in: json.expires_in
    };
  }
  const s = json.session;
  if (s && typeof s === "object" && s.access_token && s.refresh_token) {
    return {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: s.expires_in
    };
  }
  return null;
}

/**
 * 标准邮箱+密码注册（GoTrue /signup，anon key）。
 * 在「需要邮箱确认」的项目中会由 Supabase 发送确认邮件；邮件内容须在 Dashboard 模板中突出 {{ .Token }}（6 位 OTP），
 * 与 verifyOtp({ type: 'signup', token, email }) 一致。
 * 注意：admin.createUser 不会发送确认邮件，且易导致「无 OTP 邮件 / 仅线下建用户」；桌面主链应使用本方法而非 admin.createUser。
 *
 * @returns {Promise<{ user?: object, session?: object|null, raw?: object, error?: string, error_code?: string, http_status?: number, errorDetail?: object }>}
 */
async function signUpWithPassword(email, password, userMeta, options) {
  const requestId =
    options && typeof options === "object" && options.requestId != null
      ? String(options.requestId)
      : "";
  const c = config();
  const anon = c.supabaseAnonKey;
  if (!anon) {
    return {
      error: "supabase_anon_missing",
      errorDetail: {
        upstreamAction: "gotrue.signup",
        upstreamStatus: null,
        upstreamCode: "supabase_anon_missing",
        upstreamMessage: "SUPABASE_ANON_KEY 未配置（signup 必须使用 anon）",
        responseBody: null
      }
    };
  }
  const baseUrl = gotrueUrl("/auth/v1/signup");
  const redirectTo = String(process.env.AUTH_SIGNUP_EMAIL_REDIRECT_TO || "").trim();
  const url =
    redirectTo.length > 0
      ? `${baseUrl}?redirect_to=${encodeURIComponent(redirectTo)}`
      : baseUrl;

  let json;
  let status;
  let ok;
  try {
    const r = await postJson(
      url,
      { apikey: anon, Authorization: `Bearer ${anon}` },
      {
        email,
        password,
        data: userMeta || {}
      }
    );
    json = r.json;
    status = r.status;
    ok = r.ok;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      error: err.message,
      errorDetail: {
        upstreamAction: "gotrue.signup",
        upstreamStatus: null,
        upstreamCode: "signup_throw",
        upstreamMessage: err.message,
        responseBody: { thrown: true, name: err.name }
      }
    };
  }

  if (!ok || !json || typeof json !== "object") {
    const msg =
      json && typeof json === "object"
        ? String(
            json.msg ||
              json.message ||
              json.error_description ||
              json.error ||
              `gotrue_signup_${status}`
          )
        : `gotrue_signup_${status}`;
    const errCode =
      json && typeof json === "object" && json.error_code != null
        ? String(json.error_code)
        : json && typeof json === "object" && json.error != null
          ? String(json.error)
          : "";
    return {
      error: msg,
      error_code: errCode,
      http_status: status,
      errorDetail: {
        upstreamAction: "gotrue.signup",
        upstreamStatus: status,
        upstreamCode: errCode || null,
        upstreamMessage: msg,
        responseBody: json
      }
    };
  }

  const { user, parseBranch, keys } = pickSignupUserPayload(json);
  if (!nonEmptyUserId(user)) {
    return {
      error: "signup_empty_user",
      errorDetail: {
        upstreamAction: "gotrue.signup",
        upstreamStatus: status,
        upstreamCode: "empty_user",
        upstreamMessage: "signup 成功但响应中无法解析 user.id（已尝试 user / data.user / data / root）",
        responseBody: { keys, parseBranch }
      }
    };
  }

  const session = pickSignupSession(json);

  authLog({
    event: "gotrue_signup_parse",
    requestId: requestId || undefined,
    user_id: user.id,
    jti: null,
    client_platform: null,
    product: null,
    authProvider: "supabase",
    signupParseBranch: parseBranch,
    responseKeys: keys
  });

  return { user, session, raw: json };
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
 * @returns {Promise<{ user?: import('@supabase/supabase-js').User, error?: string, errorDetail?: object }>}
 */
async function adminCreateUser(email, password, userMeta) {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      error: "supabase_admin_missing",
      errorDetail: {
        upstreamAction: "admin.createUser",
        upstreamStatus: null,
        upstreamCode: "supabase_admin_missing",
        upstreamMessage:
          "getSupabaseAdminClient() returned null；检查 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY",
        responseBody: null
      }
    };
  }
  let data;
  let error;
  try {
    const r = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: userMeta || {}
    });
    data = r.data;
    error = r.error;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      error: err.message,
      errorDetail: {
        upstreamAction: "admin.createUser",
        upstreamStatus: null,
        upstreamCode: err.code != null ? String(err.code) : "createUser_throw",
        upstreamMessage: err.message,
        responseBody: { thrown: true, name: err.name }
      }
    };
  }
  if (error) {
    const msg = error.message || String(error);
    const code =
      error.code != null ? String(error.code) : error.name != null ? String(error.name) : null;
    return {
      error: msg,
      errorDetail: {
        upstreamAction: "admin.createUser",
        upstreamStatus: error.status != null ? error.status : null,
        upstreamCode: code,
        upstreamMessage: msg,
        responseBody: {
          status: error.status,
          code: error.code,
          name: error.name,
          message: error.message
        }
      }
    };
  }
  if (!data?.user) {
    return {
      error: "createUser_empty_user",
      errorDetail: {
        upstreamAction: "admin.createUser",
        upstreamStatus: null,
        upstreamCode: "empty_user",
        upstreamMessage: "admin.createUser 成功但响应中无 user",
        responseBody: { dataPresent: Boolean(data), dataKeys: data ? Object.keys(data) : [] }
      }
    };
  }
  return { user: data.user };
}

/**
 * 在 GoTrue Admin 中按邮箱查找用户（用于注册重复时区分 email_confirmed_at）。
 * 分页扫描，适用于中小规模；极大规模项目应改为带筛选的 Admin API。
 *
 * @returns {Promise<{ user: import('@supabase/supabase-js').User | null, error?: string }>}
 */
async function findAdminUserByEmail(emailNorm) {
  const admin = getSupabaseAdminClient();
  if (!admin) return { user: null, error: "supabase_admin_missing" };
  const target = String(emailNorm || "")
    .trim()
    .toLowerCase();
  if (!target) return { user: null, error: "email_required" };
  try {
    let page = 1;
    const perPage = 200;
    for (let guard = 0; guard < 30; guard += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        return { user: null, error: error.message || String(error) };
      }
      const users = data?.users || [];
      const u = users.find((x) => String(x.email || "").toLowerCase() === target);
      if (u) return { user: u };
      if (users.length < perPage) break;
      page += 1;
    }
    return { user: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { user: null, error: err.message };
  }
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
  signUpWithPassword,
  findAdminUserByEmail,
  getUserFromAccessToken
};
