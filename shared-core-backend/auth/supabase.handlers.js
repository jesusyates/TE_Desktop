/**
 * AUTH_PROVIDER=supabase — 唯一认证源：Supabase Auth + public.profiles。
 * 响应形状与 auth.handlers 对齐，供 /v1/auth/* 与 legacy-kernel 复用。
 */
const { parseClientHeaders } = require("./client-meta.util");
const { authLog } = require("./auth.log");
const authRate = require("./auth.rate-limit");
const authValidation = require("./auth.validation");
const authResendCooldown = require("./auth.resend-cooldown");
const preferencesService = require("../preferences/preferences.service");
const { assertAuthMeUser } = require("../context/context-assert.util");
const {
  getProfileByUserId,
  ensureProfileRow,
  formatPublicProfile
} = require("../src/services/v1/profiles.service");
const {
  signInWithPassword,
  refreshSession,
  adminCreateUser,
  getUserFromAccessToken
} = require("../src/services/v1/supabase-auth.service");
const { getSupabaseAdminClient } = require("../src/infra/supabase/client");

function invalidEmailFormatBody() {
  return {
    status: 400,
    body: {
      success: false,
      code: "INVALID_EMAIL_FORMAT",
      message: "邮箱格式无效"
    }
  };
}

function authTooManyRequests() {
  return {
    status: 429,
    body: {
      success: false,
      code: "TOO_MANY_REQUESTS",
      message: "请求过于频繁，请稍后再试。"
    }
  };
}

function resendCooldownResponse(remainingSeconds) {
  const rs = Math.max(0, Math.ceil(Number(remainingSeconds) || 0));
  return {
    status: 400,
    body: {
      success: false,
      code: "RESEND_COOLDOWN",
      remainingSeconds: rs,
      message: "请稍后再试"
    }
  };
}

function syntheticRow(user, profile) {
  const su = user;
  const p = profile || {};
  return {
    user_id: su.id,
    email: su.email || p.email || "",
    market: p.market || (su.user_metadata && su.user_metadata.market) || "global",
    locale: p.locale || (su.user_metadata && su.user_metadata.locale) || "en",
    status: "active"
  };
}

function isDuplicateUserError(msg) {
  const s = String(msg || "").toLowerCase();
  return (
    s.includes("already") ||
    s.includes("registered") ||
    s.includes("exists") ||
    s.includes("duplicate") ||
    s.includes("user not allowed") ||
    s.includes("422")
  );
}

async function handleAuthLogin(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    authLog({ event: "login_failed", user_id: null, jti: null, client_platform: null, product: null });
    return {
      status: 400,
      body: { success: false, message: "无法完成登录，请更新应用后重试。" }
    };
  }
  const email = body.email;
  const password = body.password;
  if (email == null || typeof email !== "string" || !String(email).trim()) {
    authLog({
      event: "login_failed",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 400, body: { success: false, message: "请填写邮箱" } };
  }
  const emailTrim = authValidation.normalizeEmailInput(email);
  if (!authValidation.isValidEmailFormat(emailTrim)) {
    return invalidEmailFormatBody();
  }
  const emailNorm = emailTrim.toLowerCase();
  const ip = authRate.getClientIp(req);
  if (authRate.loginCooldownRemainingMs(ip, emailNorm) > 0) return authTooManyRequests();
  if (!authRate.loginComboConsume(ip, emailNorm)) return authTooManyRequests();

  const grant = await signInWithPassword(emailNorm, String(password || ""));
  if (
    grant.error_code === "email_not_confirmed" ||
    /confirm|verify|验证/i.test(String(grant.error || ""))
  ) {
    authRate.recordLoginPasswordFailure(ip, emailNorm);
    authLog({
      event: "login_failed_unverified",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 403,
      body: {
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message: "请先完成邮箱验证后再登录。"
      }
    };
  }
  if (grant.error || !grant.access_token) {
    authRate.recordLoginPasswordFailure(ip, emailNorm);
    authLog({
      event: "login_failed",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 401,
      body: {
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "邮箱或密码错误"
      }
    };
  }

  const gu = await getUserFromAccessToken(grant.access_token);
  if (!gu.user) {
    authRate.recordLoginPasswordFailure(ip, emailNorm);
    return {
      status: 401,
      body: {
        success: false,
        code: "INVALID_CREDENTIALS",
        message: "邮箱或密码错误"
      }
    };
  }
  if (!gu.user.email_confirmed_at) {
    authRate.recordLoginPasswordFailure(ip, emailNorm);
    authLog({
      event: "login_failed_unverified",
      user_id: gu.user.id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 403,
      body: {
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message: "请先完成邮箱验证后再登录。"
      }
    };
  }
  const profile = await getProfileByUserId(gu.user.id);
  const urow = preferencesService.prepareUserForToken(syntheticRow(gu.user, profile));

  authRate.clearLoginPasswordState(ip, emailNorm);
  authLog({
    event: "login_success",
    user_id: urow.user_id,
    jti: null,
    client_platform: meta.client_platform,
    product: meta.product
  });
  return {
    status: 200,
    body: {
      success: true,
      token: grant.access_token,
      refresh_token: grant.refresh_token,
      user: { userId: urow.user_id, email: urow.email || emailNorm },
      profile: formatPublicProfile(profile),
      emailConfirmed: true
    }
  };
}

async function handleAuthRegister(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return {
      status: 400,
      body: { success: false, message: "无法完成注册，请更新应用后重试。" }
    };
  }
  const email = body && body.email;
  const password = body && body.password;
  const marketIn = body && body.market;
  const localeIn = body && body.locale;
  if (email == null || typeof email !== "string" || !String(email).trim()) {
    return { status: 400, body: { success: false, message: "请填写邮箱" } };
  }
  const emailTrim = authValidation.normalizeEmailInput(email);
  if (!authValidation.isValidEmailFormat(emailTrim)) {
    return invalidEmailFormatBody();
  }
  if (password == null || typeof password !== "string" || String(password).length < 8) {
    return { status: 400, body: { success: false, message: "密码至少 8 位" } };
  }
  if (String(password).length > 256) {
    return { status: 400, body: { success: false, message: "密码过长" } };
  }
  const emailNorm = emailTrim.toLowerCase();
  const regIp = authRate.getClientIp(req);
  if (!authRate.registerAllow(regIp, emailNorm)) return authTooManyRequests();

  const m =
    marketIn != null && String(marketIn).trim()
      ? String(marketIn).trim().toLowerCase()
      : "global";
  const l =
    localeIn != null && String(localeIn).trim() ? String(localeIn).trim() : "en-US";

  const created = await adminCreateUser(emailNorm, String(password), { market: m, locale: l });
  if (created.error) {
    if (isDuplicateUserError(created.error)) {
      const probe = await signInWithPassword(emailNorm, String(password));
      if (!probe.error && probe.access_token) {
        return {
          status: 409,
          body: {
            success: false,
            code: "EMAIL_ALREADY_EXISTS",
            emailVerified: true,
            message: "该邮箱已注册，请直接登录"
          }
        };
      }
      if (probe.error_code === "email_not_confirmed") {
        return {
          status: 409,
          body: {
            success: false,
            code: "EMAIL_ALREADY_EXISTS",
            emailVerified: false,
            email: emailNorm,
            message: "该邮箱已注册但尚未验证，请完成邮箱验证"
          }
        };
      }
      return {
        status: 409,
        body: {
          success: false,
          code: "EMAIL_ALREADY_EXISTS",
          emailVerified: true,
          message: "该邮箱已注册，请直接登录"
        }
      };
    }
    authLog({
      event: "register_failed",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 500, body: { success: false, message: "注册失败，请稍后重试" } };
  }

  const u = created.user;
  if (!u?.id) {
    return { status: 500, body: { success: false, message: "注册失败，请稍后重试" } };
  }

  await ensureProfileRow(u.id, u.email || emailNorm, m, l);

  authLog({
    event: "register_success",
    user_id: u.id,
    jti: null,
    client_platform: meta.client_platform,
    product: meta.product
  });

  return {
    status: 201,
    body: {
      success: true,
      needsVerification: true,
      email: u.email || emailNorm
    }
  };
}

async function handleAuthVerifyEmail(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return { status: 400, body: { success: false, message: "无法完成验证，请更新应用后重试。" } };
  }
  const admin = getSupabaseAdminClient();
  if (!admin) return { status: 500, body: { success: false, message: "验证失败，请稍后重试" } };

  const tokenHashRaw = body && (body.token_hash || body.token);
  const linkType =
    body && body.type != null && String(body.type).trim()
      ? String(body.type).trim().toLowerCase()
      : "signup";

  /** 邮件内 magic link：token_hash + type（signup | email） */
  if (tokenHashRaw != null && String(tokenHashRaw).trim().length >= 8) {
    const token_hash = String(tokenHashRaw).trim();
    const otpType =
      linkType === "email" || linkType === "signup" || linkType === "magiclink" ? linkType : "signup";
    const { data, error } = await admin.auth.verifyOtp({
      token_hash,
      type: otpType
    });
    if (error || !data?.user) {
      return {
        status: 400,
        body: { success: false, code: "INVALID_VERIFICATION_TOKEN", message: "验证链接无效或已过期" }
      };
    }
    const em = data.user.email || "";
    await ensureProfileRow(data.user.id, em, "global", "en");
    const session = data.session;
    if (session && session.access_token) {
      const profile = await getProfileByUserId(data.user.id);
      const urow = preferencesService.prepareUserForToken(syntheticRow(data.user, profile));
      authLog({
        event: "verify_email_success",
        user_id: urow.user_id,
        jti: null,
        client_platform: meta.client_platform,
        product: meta.product
      });
      return {
        status: 200,
        body: {
          success: true,
          token: session.access_token,
          refresh_token: session.refresh_token,
          user: { userId: urow.user_id, email: urow.email || em },
          profile: formatPublicProfile(profile),
          emailConfirmed: true
        }
      };
    }
    authLog({
      event: "verify_email_success",
      user_id: data.user.id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 200,
      body: {
        success: true,
        message: "邮箱已验证，请使用密码登录。",
        emailConfirmed: true,
        email: em
      }
    };
  }

  const email = body && body.email;
  const rawCode = body && body.code;
  if (email == null || typeof email !== "string" || !String(email).trim()) {
    return { status: 400, body: { success: false, message: "请填写邮箱" } };
  }
  if (rawCode == null || String(rawCode).trim().length < 6) {
    return { status: 400, body: { success: false, message: "请输入 6 位验证码" } };
  }
  const emailNorm = authValidation.normalizeEmailInput(email).toLowerCase();
  if (!authValidation.isValidEmailFormat(emailNorm)) {
    return invalidEmailFormatBody();
  }

  const { data, error } = await admin.auth.verifyOtp({
    type: "signup",
    token: String(rawCode).trim(),
    email: emailNorm
  });
  if (error || !data?.user) {
    return { status: 400, body: { success: false, message: "验证码无效或已过期" } };
  }

  await ensureProfileRow(data.user.id, data.user.email || emailNorm, "global", "en");

  const session = data.session;
  if (session && session.access_token) {
    const profile = await getProfileByUserId(data.user.id);
    const urow = preferencesService.prepareUserForToken(syntheticRow(data.user, profile));
    authLog({
      event: "verify_email_success",
      user_id: urow.user_id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 200,
      body: {
        success: true,
        token: session.access_token,
        refresh_token: session.refresh_token,
        user: { userId: urow.user_id, email: urow.email || emailNorm },
        profile: formatPublicProfile(profile),
        emailConfirmed: true
      }
    };
  }

  authLog({
    event: "verify_email_success",
    user_id: data.user.id,
    jti: null,
    client_platform: meta.client_platform,
    product: meta.product
  });
  return {
    status: 200,
    body: {
      success: true,
      message: "验证成功，请使用密码登录。",
      emailConfirmed: true,
      email: emailNorm
    }
  };
}

async function handleAuthResendVerification(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return { status: 400, body: { success: false, message: "请求无效" } };
  }
  const email = body && body.email;
  if (email == null || typeof email !== "string" || !String(email).trim()) {
    return { status: 400, body: { success: false, message: "请填写邮箱" } };
  }
  const emailNorm = authValidation.normalizeEmailInput(email).toLowerCase();
  if (!authValidation.isValidEmailFormat(emailNorm)) {
    return invalidEmailFormatBody();
  }
  const sendIp = authRate.getClientIp(req);
  const coolLeft = authResendCooldown.getVerifyRemainingSeconds(emailNorm);
  if (coolLeft > 0) return resendCooldownResponse(coolLeft);
  if (!authRate.sendCodeAllow(sendIp, emailNorm)) return authTooManyRequests();

  const admin = getSupabaseAdminClient();
  if (!admin) return { status: 500, body: { success: false, message: "发送失败，请稍后重试" } };

  const { error } = await admin.auth.resend({ type: "signup", email: emailNorm });
  if (error) {
    authLog({
      event: "resend_verification_failed",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 400, body: { success: false, message: "该邮箱无需重新发送验证码或发送失败" } };
  }
  authResendCooldown.recordVerifySent(emailNorm);
  return { status: 200, body: { success: true } };
}

async function handleAuthForgotPassword(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return { status: 400, body: { success: false, message: "请求无效" } };
  }
  const email = body && body.email;
  if (email == null || typeof email !== "string" || !String(email).trim()) {
    return { status: 400, body: { success: false, message: "请填写邮箱" } };
  }
  const emailNorm = authValidation.normalizeEmailInput(email).toLowerCase();
  if (!authValidation.isValidEmailFormat(emailNorm)) {
    return invalidEmailFormatBody();
  }
  const fpIp = authRate.getClientIp(req);
  if (!authRate.sendCodeAllow(fpIp, emailNorm)) return authTooManyRequests();

  const admin = getSupabaseAdminClient();
  const neutralBody = {
    success: true,
    message:
      "若该邮箱已注册，您将收到一封来自系统的密码重置邮件，请按邮件说明操作。如未收到，请检查垃圾箱或稍后再试。"
  };
  if (!admin) return { status: 200, body: neutralBody };

  const redirectTo =
    String(process.env.AUTH_RECOVERY_REDIRECT_URL || "").trim() || "http://127.0.0.1:5173/auth/reset";
  const { error } = await admin.auth.resetPasswordForEmail(emailNorm, { redirectTo });
  if (error) {
    authLog({
      event: "password_reset_request_error",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
  }
  return { status: 200, body: neutralBody };
}

async function handleAuthResetPassword(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return { status: 400, body: { success: false, message: "无法完成重置，请更新应用后重试。" } };
  }
  const newPassword =
    body && body.newPassword != null
      ? body.newPassword
      : body && body.new_password != null
        ? body.new_password
        : "";
  const pwd = String(newPassword);
  if (pwd.length < 8) {
    return { status: 400, body: { success: false, message: "新密码至少 8 位" } };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return { status: 500, body: { success: false, message: "重置失败，请稍后重试" } };

  const tokenHashRaw = body && (body.token_hash || body.token);
  let data;
  let error;

  if (tokenHashRaw != null && String(tokenHashRaw).trim().length >= 8) {
    const r = await admin.auth.verifyOtp({
      token_hash: String(tokenHashRaw).trim(),
      type: "recovery"
    });
    data = r.data;
    error = r.error;
  } else {
    const email = body && body.email;
    const rawCode = body && body.code;
    if (email == null || typeof email !== "string" || !String(email).trim()) {
      return { status: 400, body: { success: false, message: "请填写邮箱" } };
    }
    if (rawCode == null || String(rawCode).trim().length < 6) {
      return { status: 400, body: { success: false, message: "请输入 6 位验证码" } };
    }
    const emailNorm = authValidation.normalizeEmailInput(email).toLowerCase();
    if (!authValidation.isValidEmailFormat(emailNorm)) {
      return invalidEmailFormatBody();
    }
    const r = await admin.auth.verifyOtp({
      type: "recovery",
      token: String(rawCode).trim(),
      email: emailNorm
    });
    data = r.data;
    error = r.error;
  }

  if (error || !data?.user?.id) {
    return { status: 400, body: { success: false, message: "验证码无效或已过期" } };
  }
  const { error: updErr } = await admin.auth.admin.updateUserById(data.user.id, { password: pwd });
  if (updErr) {
    return { status: 500, body: { success: false, message: "重置失败，请稍后重试" } };
  }

  let sessionTokens = null;
  if (data.session && data.session.access_token) {
    sessionTokens = {
      token: data.session.access_token,
      refresh_token: data.session.refresh_token
    };
  } else {
    const u = data.user;
    if (u.email) {
      const grant = await signInWithPassword(u.email, pwd);
      if (!grant.error && grant.access_token) {
        sessionTokens = { token: grant.access_token, refresh_token: grant.refresh_token };
      }
    }
  }

  authLog({
    event: "password_reset_complete",
    user_id: data.user.id,
    jti: null,
    client_platform: meta.client_platform,
    product: meta.product
  });
  const profile = await getProfileByUserId(data.user.id);
  const urow = preferencesService.prepareUserForToken(syntheticRow(data.user, profile));
  return {
    status: 200,
    body: {
      success: true,
      ...(sessionTokens
        ? {
            token: sessionTokens.token,
            refresh_token: sessionTokens.refresh_token,
            user: { userId: urow.user_id, email: urow.email },
            profile: formatPublicProfile(profile),
            passwordResetAutoLogin: true
          }
        : { passwordResetAutoLogin: false })
    }
  };
}

async function handleAuthRefresh(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    authLog({ event: "refresh_failed", user_id: null, jti: null, client_platform: null, product: null });
    return {
      status: 400,
      body: { success: false, code: "CLIENT_ERROR", message: meta.error }
    };
  }
  const rt = body.refresh_token;
  if (rt == null || typeof rt !== "string" || !String(rt).trim()) {
    return {
      status: 401,
      body: { success: false, code: "TOKEN_EXPIRED", message: "登录已失效，请重新登录。" }
    };
  }
  const out = await refreshSession(String(rt).trim());
  if (out.error || !out.access_token) {
    authLog({
      event: "refresh_failed",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 401,
      body: { success: false, code: "TOKEN_EXPIRED", message: "登录已失效，请重新登录。" }
    };
  }
  const gu = await getUserFromAccessToken(out.access_token);
  if (!gu.user) {
    return {
      status: 401,
      body: { success: false, code: "TOKEN_EXPIRED", message: "登录已失效，请重新登录。" }
    };
  }
  const profile = await getProfileByUserId(gu.user.id);
  const urow = preferencesService.prepareUserForToken(syntheticRow(gu.user, profile));
  authLog({
    event: "refresh_success",
    user_id: urow.user_id,
    jti: null,
    client_platform: meta.client_platform,
    product: meta.product
  });
  const prof = await getProfileByUserId(gu.user.id);
  return {
    status: 200,
    body: {
      success: true,
      access_token: out.access_token,
      refresh_token: out.refresh_token,
      user: {
        user_id: urow.user_id,
        email: urow.email,
        market: urow.market,
        locale: urow.locale,
        product: meta.product,
        client_platform: meta.client_platform
      },
      profile: formatPublicProfile(prof)
    }
  };
}

async function handleAuthMe(req, accessToken) {
  const hdr = req && req.headers ? req.headers : {};
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    authLog({ event: "auth_400", user_id: null, jti: null, client_platform: null, product: null });
    return { status: 400, body: { success: false, message: "请求无效" } };
  }
  if (!accessToken) {
    authLog({
      event: "auth_401",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 401,
      body: { success: false, code: "TOKEN_EXPIRED", message: "登录已失效" }
    };
  }
  const gu = await getUserFromAccessToken(accessToken);
  if (!gu.user) {
    authLog({
      event: "auth_401",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 401,
      body: { success: false, code: "TOKEN_EXPIRED", message: "登录已失效" }
    };
  }
  if (!gu.user.email_confirmed_at) {
    return {
      status: 403,
      body: {
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message: "请先完成邮箱验证。"
      }
    };
  }
  const profile = await getProfileByUserId(gu.user.id);
  const row = syntheticRow(gu.user, profile);
  const eff = preferencesService.resolveForMe(gu.user.id, row.market, row.locale, hdr);
  const userPayload = {
    user_id: gu.user.id,
    email: gu.user.email || profile?.email || "",
    market: eff.market,
    locale: eff.locale,
    product: meta.product,
    client_platform: meta.client_platform
  };
  const assert = assertAuthMeUser({
    user_id: userPayload.user_id,
    email: userPayload.email,
    market: userPayload.market,
    locale: userPayload.locale,
    product: userPayload.product,
    client_platform: userPayload.client_platform
  });
  if (!assert.ok) {
    return { status: 401, body: { success: false, message: "登录已失效" } };
  }
  return {
    status: 200,
    body: {
      success: true,
      user: {
        userId: userPayload.user_id,
        email: userPayload.email,
        market: userPayload.market,
        locale: userPayload.locale,
        product: userPayload.product,
        client_platform: userPayload.client_platform
      },
      profile: formatPublicProfile(profile)
    }
  };
}

async function handleAuthLogout(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return { status: 400, body: { success: false, message: "退出失败" } };
  }
  const admin = getSupabaseAdminClient();
  const rt = body && body.refresh_token;
  if (admin && rt != null && typeof rt === "string" && String(rt).trim()) {
    const out = await refreshSession(String(rt).trim());
    if (!out.error && out.access_token) {
      try {
        await admin.auth.admin.signOut(out.access_token, "global");
      } catch {
        /* 忽略已过期等 */
      }
    }
  }
  authLog({
    event: "logout",
    user_id: null,
    jti: null,
    client_platform: meta.client_platform,
    product: meta.product
  });
  return { status: 200, body: { success: true } };
}

module.exports = {
  handleAuthLogin,
  handleAuthRegister,
  handleAuthVerifyEmail,
  handleAuthResendVerification,
  handleAuthForgotPassword,
  handleAuthResetPassword,
  handleAuthRefresh,
  handleAuthMe,
  handleAuthLogout
};
