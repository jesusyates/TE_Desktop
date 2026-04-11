/**
 * MODULE C / C-2 — Shared Core Auth（禁止 mock）
 *
 * C-5 / C-6：market/locale 以 preference + session 裁定为准；客户端 header 不得成为 market/locale/user_id 权威；
 * session_version 仅由 Core 递增（经 session-version / preferences-sync）；禁止用 401 覆盖所有「上下文陈旧」场景。
 *
 * 禁止：第二套用户体系；本地身份为权威；在 auth.handlers 内散写 session_version；refresh 风暴。
 * refresh_token 未来 Web 场景应使用 httpOnly Cookie 承载（见 jwt.util.js 注释），禁止浏览器脚本可读。
 */
const { randomUUID } = require("crypto");
const { verifyPassword } = require("./password.util");
const { signJwt, verifyJwt } = require("./jwt.util");
const authRepository = require("./auth.repository");
const { parseClientHeaders } = require("./client-meta.util");
const { authLog } = require("./auth.log");
const {
  buildRegisterFailedPayload,
  pickDevUpstreamBody
} = require("./auth-error-diagnostics.util");
const preferencesService = require("../preferences/preferences.service");
const { getCurrentSessionVersionForIssuance } = require("./session-version.util");
const { assertAuthMeUser } = require("../context/context-assert.util");
const emailVerification = require("./email-verification");
const passwordReset = require("./password-reset");
const authRate = require("./auth.rate-limit");
const authValidation = require("./auth.validation");
const authMailer = require("./auth.mailer");
const authResendCooldown = require("./auth.resend-cooldown");
const { config } = require("../src/infra/config");
const { isAuthProviderSupabase } = require("./auth-provider.util");

function assertLegacyAuthHandlersAllowed() {
  if (isAuthProviderSupabase()) {
    throw new Error("LEGACY_AUTH_DISABLED_IN_SUPABASE_MODE");
  }
}

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;

function getSecret() {
  const s = process.env.SHARED_CORE_AUTH_SECRET || process.env.AUTH_SECRET;
  if (!s || String(s).length < 16) {
    throw new Error(
      "SHARED_CORE_AUTH_SECRET（或 AUTH_SECRET）须 >= 16 字符；请在 shared-core-backend/.env 中配置（见 .env.example）。"
    );
  }
  return String(s);
}

function ensureBootstrapEnv() {
  const email = process.env.AUTH_BOOTSTRAP_EMAIL;
  const password = process.env.AUTH_BOOTSTRAP_PASSWORD;
  if (!email || !String(email).trim()) {
    throw new Error("AUTH_BOOTSTRAP_EMAIL 必填（非空）；见 shared-core-backend/.env.example");
  }
  if (!password || String(password).length < 1) {
    throw new Error("AUTH_BOOTSTRAP_PASSWORD 必填；见 shared-core-backend/.env.example");
  }
}

function isValidAccessClaims(p) {
  if (!p || typeof p !== "object") return false;
  for (const k of ["user_id", "market", "locale", "product", "client_platform"]) {
    const v = p[k];
    if (v == null || typeof v !== "string" || !String(v).trim()) return false;
  }
  const sv = p.session_version;
  if (!Number.isInteger(sv) || sv < 1) return false;
  return true;
}

function isValidRefreshClaims(p) {
  if (!p || typeof p !== "object") return false;
  if (p.user_id == null || typeof p.user_id !== "string" || !String(p.user_id).trim()) return false;
  if (p.jti == null || typeof p.jti !== "string" || !String(p.jti).trim()) return false;
  const sv = p.session_version;
  if (!Number.isInteger(sv) || sv < 1) return false;
  return true;
}

/**
 * 生产主链：AUTH_PROVIDER=supabase — 仅校验 Supabase 环境，不要求 JWT/bootstrap。
 * 本地遗留链：AUTH_PROVIDER=legacy — JWT + SQLite bootstrap（AUTH_LEGACY_BOOTSTRAP_ENABLE=1 或开发环境）。
 */
function ensureAuthEnv() {
  const c = config();
  if (c.authProvider === "supabase") {
    if (!c.supabaseUrl || !c.supabaseServiceRoleKey || !c.supabaseAnonKey) {
      throw new Error(
        "AUTH_PROVIDER=supabase 须配置 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、SUPABASE_ANON_KEY（见 .env.example）。"
      );
    }
    return;
  }

  getSecret();
  const allowBootstrap =
    c.nodeEnv !== "production" || String(process.env.AUTH_LEGACY_BOOTSTRAP_ENABLE || "").trim() === "1";
  if (!allowBootstrap) {
    throw new Error(
      "AUTH_PROVIDER=legacy 在生产环境须设置 AUTH_LEGACY_BOOTSTRAP_ENABLE=1，或改用 AUTH_PROVIDER=supabase（应急/迁移专用）。"
    );
  }
  ensureBootstrapEnv();
  authRepository.bootstrapFromEnv();
  const bootEmail = String(process.env.AUTH_BOOTSTRAP_EMAIL).trim().toLowerCase();
  if (!authRepository.findUserByEmail(bootEmail)) {
    throw new Error(
      "未能创建 bootstrap 用户；请检查 AUTH_BOOTSTRAP_EMAIL / AUTH_BOOTSTRAP_PASSWORD 及数据库状态（见 .env.example）。"
    );
  }
}

function issuePair(user, product, client_platform) {
  const secret = getSecret();
  const session_version = getCurrentSessionVersionForIssuance(user.user_id);
  const access_token = signJwt(
    {
      user_id: user.user_id,
      market: user.market,
      locale: user.locale,
      product,
      client_platform,
      session_version
    },
    secret,
    ACCESS_TTL_SEC
  );
  const jti = randomUUID();
  const refresh_token = signJwt({ user_id: user.user_id, jti, session_version }, secret, REFRESH_TTL_SEC);
  authRepository.saveRefreshToken(jti, user.user_id, REFRESH_TTL_SEC * 1000);
  return {
    access_token,
    refresh_token,
    user: {
      user_id: user.user_id,
      email: user.email,
      market: user.market,
      locale: user.locale,
      product,
      client_platform
    },
    _issued_jti: jti
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

function authTooManyAttempts() {
  return {
    status: 429,
    body: {
      success: false,
      code: "TOO_MANY_ATTEMPTS",
      message: "尝试次数过多，请稍后再试。"
    }
  };
}

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

function handleAuthLogin(req, body) {
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
  const emailTrimLogin = authValidation.normalizeEmailInput(email);
  if (!authValidation.isValidEmailFormat(emailTrimLogin)) {
    return invalidEmailFormatBody();
  }
  const emailNorm = emailTrimLogin.toLowerCase();
  const ip = authRate.getClientIp(req);
  if (authRate.loginCooldownRemainingMs(ip, emailNorm) > 0) {
    authLog({
      event: "login_rate_limited",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return authTooManyRequests();
  }
  if (!authRate.loginComboConsume(ip, emailNorm)) {
    authLog({
      event: "login_rate_limited",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return authTooManyRequests();
  }
  const userRaw = authRepository.findUserByEmail(emailNorm);
  if (!userRaw || !verifyPassword(String(password || ""), userRaw.password_hash)) {
    authRate.recordLoginPasswordFailure(ip, emailNorm);
    authLog({
      event: "login_failed",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 401, body: { success: false, message: "邮箱或密码错误" } };
  }
  const acctStatus = String(userRaw.status || "active").toLowerCase();
  if (acctStatus === "pending_verification") {
    authLog({
      event: "login_failed_unverified",
      user_id: userRaw.user_id,
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
  if (acctStatus !== "active") {
    authLog({
      event: "login_failed",
      user_id: userRaw.user_id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 403,
      body: { success: false, message: "账户暂不可用，请稍后再试或联系支持。" }
    };
  }
  const user = preferencesService.prepareUserForToken(userRaw);
  const issued = issuePair(user, meta.product, meta.client_platform);
  authRate.clearLoginPasswordState(ip, emailNorm);
  authLog({
    event: "login_success",
    user_id: user.user_id,
    jti: issued._issued_jti,
    client_platform: meta.client_platform,
    product: meta.product
  });
  /** MODULE C-1：对外契约；refresh_token 供桌面 / Web 客户端持久化（Web 生产建议逐步改为 httpOnly Cookie）。 */
  return {
    status: 200,
    body: {
      success: true,
      token: issued.access_token,
      refresh_token: issued.refresh_token,
      user: { userId: user.user_id, email: user.email }
    }
  };
}

/**
 * POST /auth/register — 与登录共用签发逻辑；新用户默认可用 global/en-US（或后续由偏好同步覆盖）。
 */
async function handleAuthRegister(req, body) {
  assertLegacyAuthHandlersAllowed();
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    authLog(
      buildRegisterFailedPayload({
        req,
        meta: { client_platform: null, product: null },
        emailNorm: body && body.email,
        upstreamAction: "parseClientHeaders",
        plainErrorMessage: meta.error
      })
    );
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
  if (!authRate.registerAllow(regIp, emailNorm)) {
    authLog({
      event: "register_rate_limited",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return authTooManyRequests();
  }
  const existingReg = authRepository.findUserByEmail(emailNorm);
  if (existingReg) {
    const st = String(existingReg.status || "").toLowerCase();
    const verifiedAt = existingReg.email_verified_at;
    const emailNotVerified =
      st === "pending_verification" || verifiedAt == null || String(verifiedAt).trim() === "";
    if (emailNotVerified) {
      authLog({
        event: "register_existing_unverified",
        user_id: existingReg.user_id,
        jti: null,
        client_platform: meta.client_platform,
        product: meta.product
      });
      return {
        status: 409,
        body: {
          success: false,
          code: "EMAIL_ALREADY_EXISTS",
          emailVerified: false,
          email: existingReg.email,
          message: "该邮箱已注册但尚未验证，请完成邮箱验证"
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
  let userRaw;
  try {
    userRaw = authRepository.createUser({
      email: emailNorm,
      password: String(password),
      market:
        marketIn != null && String(marketIn).trim()
          ? String(marketIn).trim().toLowerCase()
          : "global",
      locale:
        localeIn != null && String(localeIn).trim() ? String(localeIn).trim() : "en-US",
      status: "pending_verification"
    });
  } catch (err) {
    authLog(
      buildRegisterFailedPayload({
        req,
        meta,
        emailNorm,
        upstreamAction: "authRepository.createUser",
        err: err instanceof Error ? err : new Error(String(err))
      })
    );
    return {
      status: 500,
      body: {
        success: false,
        message: "注册失败，请稍后重试",
        ...pickDevUpstreamBody(null, err instanceof Error ? err : new Error(String(err)))
      }
    };
  }
  preferencesService.prepareUserForToken(userRaw);
  const code = emailVerification.issueCode(emailNorm);
  if (!code) {
    authLog({
      event: "register_verification_code_issue_failed",
      user_id: userRaw.user_id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 500, body: { success: false, message: "注册失败，请稍后重试" } };
  }
  const mailed = await authMailer.sendVerificationCode({
    to: emailNorm,
    locale: userRaw.locale,
    code
  });
  if (!mailed.ok) {
    authLog({
      event: "register_verification_mail_failed",
      user_id: userRaw.user_id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 503,
      body: {
        success: false,
        message: "验证邮件发送失败，请稍后重试或使用「重新发送验证码」。"
      }
    };
  }
  authResendCooldown.recordVerifySent(emailNorm);
  authLog({
    event: "register_pending_verification",
    user_id: userRaw.user_id,
    jti: null,
    client_platform: meta.client_platform,
    product: meta.product
  });
  return {
    status: 201,
    body: {
      success: true,
      needsVerification: true,
      email: userRaw.email
    }
  };
}

function handleAuthVerifyEmail(req, body) {
  assertLegacyAuthHandlersAllowed();
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return {
      status: 400,
      body: { success: false, message: "无法完成验证，请更新应用后重试。" }
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
  const emailTrimVerify = authValidation.normalizeEmailInput(email);
  if (!authValidation.isValidEmailFormat(emailTrimVerify)) {
    return invalidEmailFormatBody();
  }
  const emailNorm = emailTrimVerify.toLowerCase();
  const userRaw = authRepository.findUserByEmail(emailNorm);
  if (!userRaw) {
    return { status: 404, body: { success: false, message: "用户不存在" } };
  }
  if (String(userRaw.status || "").toLowerCase() !== "pending_verification") {
    return { status: 400, body: { success: false, message: "该邮箱已验证或状态异常" } };
  }
  if (authRate.codeCheckBlocked(authRate.KIND_VERIFY, emailNorm)) {
    return authTooManyAttempts();
  }
  if (!emailVerification.verifyAndConsume(emailNorm, rawCode)) {
    if (authRate.recordCodeCheckFailure(authRate.KIND_VERIFY, emailNorm)) {
      return authTooManyAttempts();
    }
    return { status: 400, body: { success: false, message: "验证码无效或已过期" } };
  }
  authRate.clearCodeCheckFailures(authRate.KIND_VERIFY, emailNorm);
  const upd = authRepository.markUserActiveAndEmailVerified(userRaw.user_id);
  if (!upd || Number(upd.changes) !== 1) {
    return { status: 409, body: { success: false, message: "验证失败，请重试" } };
  }
  const fresh = authRepository.findUserById(userRaw.user_id);
  if (!fresh) {
    return { status: 500, body: { success: false, message: "验证失败，请稍后重试" } };
  }
  const user = preferencesService.prepareUserForToken(fresh);
  const issued = issuePair(user, meta.product, meta.client_platform);
  authLog({
    event: "verify_email_success",
    user_id: user.user_id,
    jti: issued._issued_jti,
    client_platform: meta.client_platform,
    product: meta.product
  });
  return {
    status: 200,
    body: {
      success: true,
      token: issued.access_token,
      refresh_token: issued.refresh_token,
      user: { userId: user.user_id, email: user.email }
    }
  };
}

async function handleAuthResendVerification(req, body) {
  assertLegacyAuthHandlersAllowed();
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return { status: 400, body: { success: false, message: "请求无效" } };
  }
  const email = body && body.email;
  if (email == null || typeof email !== "string" || !String(email).trim()) {
    return { status: 400, body: { success: false, message: "请填写邮箱" } };
  }
  const emailTrimResend = authValidation.normalizeEmailInput(email);
  if (!authValidation.isValidEmailFormat(emailTrimResend)) {
    return invalidEmailFormatBody();
  }
  const emailNorm = emailTrimResend.toLowerCase();
  const sendIp = authRate.getClientIp(req);
  const coolLeft = authResendCooldown.getVerifyRemainingSeconds(emailNorm);
  if (coolLeft > 0) {
    return resendCooldownResponse(coolLeft);
  }
  if (!authRate.sendCodeAllow(sendIp, emailNorm)) {
    return authTooManyRequests();
  }
  const userRaw = authRepository.findUserByEmail(emailNorm);
  if (!userRaw || String(userRaw.status || "").toLowerCase() !== "pending_verification") {
    return {
      status: 400,
      body: { success: false, message: "该邮箱无需重新发送验证码" }
    };
  }
  const code = emailVerification.issueCode(emailNorm);
  if (!code) {
    return { status: 500, body: { success: false, message: "发送失败，请稍后重试" } };
  }
  const mailed = await authMailer.sendVerificationCode({
    to: emailNorm,
    locale: userRaw.locale,
    code
  });
  if (!mailed.ok) {
    authLog({
      event: "resend_verification_mail_failed",
      user_id: userRaw.user_id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return {
      status: 503,
      body: { success: false, message: "验证码邮件发送失败，请稍后重试。" }
    };
  }
  authResendCooldown.recordVerifySent(emailNorm);
  authLog({
    event: "verify_email_resent",
    user_id: userRaw.user_id,
    jti: null,
    client_platform: meta.client_platform,
    product: meta.product
  });
  return { status: 200, body: { success: true } };
}

/**
 * Auth v1 Step 2：忘记密码 — 不暴露邮箱是否存在；已注册则邮件发送重置码。
 */
async function handleAuthForgotPassword(req, body) {
  assertLegacyAuthHandlersAllowed();
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return { status: 400, body: { success: false, message: "请求无效" } };
  }
  const email = body && body.email;
  if (email == null || typeof email !== "string" || !String(email).trim()) {
    return { status: 400, body: { success: false, message: "请填写邮箱" } };
  }
  const emailTrimFp = authValidation.normalizeEmailInput(email);
  if (!authValidation.isValidEmailFormat(emailTrimFp)) {
    return invalidEmailFormatBody();
  }
  const emailNorm = emailTrimFp.toLowerCase();
  const fpIp = authRate.getClientIp(req);
  const userRaw = authRepository.findUserByEmail(emailNorm);
  if (userRaw) {
    const coolLeft = authResendCooldown.getResetRemainingSeconds(emailNorm);
    if (coolLeft > 0) {
      return resendCooldownResponse(coolLeft);
    }
  }
  if (!authRate.sendCodeAllow(fpIp, emailNorm)) {
    return authTooManyRequests();
  }
  if (userRaw) {
    const code = passwordReset.issueCode(emailNorm);
    if (!code) {
      return { status: 500, body: { success: false, message: "发送失败，请稍后重试" } };
    }
    const mailed = await authMailer.sendPasswordResetCode({
      to: emailNorm,
      locale: userRaw.locale,
      code
    });
    if (!mailed.ok) {
      authLog({
        event: "password_reset_mail_failed",
        user_id: userRaw.user_id,
        jti: null,
        client_platform: meta.client_platform,
        product: meta.product
      });
      return {
        status: 503,
        body: { success: false, message: "重置邮件发送失败，请稍后重试。" }
      };
    }
    authResendCooldown.recordResetSent(emailNorm);
    authLog({
      event: "password_reset_code_sent",
      user_id: userRaw.user_id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
  } else {
    authLog({
      event: "password_reset_request_no_user",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
  }
  return { status: 200, body: { success: true } };
}

/**
 * Auth v1 Step 2：校验重置码（一次性）并更新密码。
 */
function handleAuthResetPassword(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return {
      status: 400,
      body: { success: false, message: "无法完成重置，请更新应用后重试。" }
    };
  }
  const email = body && body.email;
  const rawCode = body && body.code;
  const newPassword =
    body && body.newPassword != null
      ? body.newPassword
      : body && body.new_password != null
        ? body.new_password
        : "";
  if (email == null || typeof email !== "string" || !String(email).trim()) {
    return { status: 400, body: { success: false, message: "请填写邮箱" } };
  }
  if (rawCode == null || String(rawCode).trim().length < 6) {
    return { status: 400, body: { success: false, message: "请输入 6 位验证码" } };
  }
  const pwd = String(newPassword);
  if (pwd.length < 8) {
    return { status: 400, body: { success: false, message: "新密码至少 8 位" } };
  }
  const emailTrimReset = authValidation.normalizeEmailInput(email);
  if (!authValidation.isValidEmailFormat(emailTrimReset)) {
    return invalidEmailFormatBody();
  }
  const emailNorm = emailTrimReset.toLowerCase();
  if (authRate.codeCheckBlocked(authRate.KIND_RESET, emailNorm)) {
    return authTooManyAttempts();
  }
  if (!passwordReset.verifyAndConsume(emailNorm, rawCode)) {
    if (authRate.recordCodeCheckFailure(authRate.KIND_RESET, emailNorm)) {
      return authTooManyAttempts();
    }
    return { status: 400, body: { success: false, message: "验证码无效或已过期" } };
  }
  authRate.clearCodeCheckFailures(authRate.KIND_RESET, emailNorm);
  const userRaw = authRepository.findUserByEmail(emailNorm);
  if (!userRaw) {
    return { status: 400, body: { success: false, message: "重置失败，请稍后重试" } };
  }
  const upd = authRepository.updateUserPassword(userRaw.user_id, pwd);
  if (!upd || Number(upd.changes) !== 1) {
    return { status: 500, body: { success: false, message: "重置失败，请稍后重试" } };
  }
  authRepository.revokeAllRefreshTokensForUser(userRaw.user_id);
  authLog({
    event: "password_reset_complete",
    user_id: userRaw.user_id,
    jti: null,
    client_platform: meta.client_platform,
    product: meta.product
  });
  return { status: 200, body: { success: true } };
}

/**
 * C-6：refresh 仅信任 jti 生命周期与 user_id；忽略旧 access 与 refresh 内已过时的 session_version 对身份/市场的含义；
 * market/locale 一律由当前 DB preference（prepareUserForToken）+ 当前 session_version 签发。
 */
function handleAuthRefresh(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    authLog({ event: "refresh_failed", user_id: null, jti: null, client_platform: null, product: null });
    return { status: 400, body: { message: meta.error } };
  }
  const rt = body.refresh_token;
  const secret = getSecret();
  const payload = verifyJwt(rt, secret);
  if (!isValidRefreshClaims(payload)) {
    authLog({
      event: "refresh_failed",
      user_id: payload && payload.user_id ? payload.user_id : null,
      jti: payload && payload.jti ? payload.jti : null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 401, body: { message: "invalid_refresh" } };
  }
  const row = authRepository.findRefreshToken(payload.jti);
  if (!row || row.user_id !== payload.user_id) {
    authLog({
      event: "refresh_failed",
      user_id: payload.user_id,
      jti: payload.jti,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 401, body: { message: "refresh_revoked" } };
  }
  authRepository.revokeToken(payload.jti);
  const userRaw = authRepository.findUserById(payload.user_id);
  if (!userRaw) {
    authLog({
      event: "refresh_failed",
      user_id: payload.user_id,
      jti: payload.jti,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 401, body: { message: "user_not_found" } };
  }
  const user = preferencesService.prepareUserForToken(userRaw);
  const issued = issuePair(user, meta.product, meta.client_platform);
  authLog({
    event: "refresh_success",
    user_id: user.user_id,
    jti: issued._issued_jti,
    client_platform: meta.client_platform,
    product: meta.product
  });
  const { _issued_jti, ...pair } = issued;
  return {
    status: 200,
    body: {
      success: true,
      access_token: pair.access_token,
      refresh_token: pair.refresh_token,
      user: pair.user
    }
  };
}

function authMeInvalidSessionBody() {
  return { success: false, message: "登录已失效" };
}

function handleAuthMe(req, accessToken) {
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
    return { status: 401, body: authMeInvalidSessionBody() };
  }
  const accessPayload = verifyJwt(accessToken, getSecret());
  if (!isValidAccessClaims(accessPayload)) {
    authLog({
      event: "auth_401",
      user_id: null,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 401, body: authMeInvalidSessionBody() };
  }
  const row = authRepository.findUserById(accessPayload.user_id);
  if (!row) {
    authLog({
      event: "auth_401",
      user_id: accessPayload.user_id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 401, body: authMeInvalidSessionBody() };
  }
  const eff = preferencesService.resolveForMe(
    accessPayload.user_id,
    accessPayload.market,
    accessPayload.locale,
    hdr
  );
  const userPayload = {
    user_id: accessPayload.user_id,
    email: row.email,
    market: eff.market,
    locale: eff.locale,
    product: accessPayload.product,
    client_platform: accessPayload.client_platform
  };
  const assert = assertAuthMeUser(userPayload);
  if (!assert.ok) {
    authLog({
      event: "auth_me_assert_failed",
      user_id: userPayload.user_id,
      jti: null,
      client_platform: meta.client_platform,
      product: meta.product
    });
    return { status: 401, body: authMeInvalidSessionBody() };
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
      }
    }
  };
}

function logoutFailBody() {
  return { success: false, message: "退出失败" };
}

/**
 * MODULE C-4：POST /auth/logout — 契约 success 信封；无 refresh 时仍 200（仅清客户端态；服务端不撤销）。
 */
function handleAuthLogout(req, body) {
  const meta = parseClientHeaders(req);
  if ("error" in meta) {
    return { status: 400, body: logoutFailBody() };
  }
  const rt = body && body.refresh_token;
  if (rt != null && typeof rt === "string" && String(rt).trim()) {
    const payload = verifyJwt(rt, getSecret());
    if (!isValidRefreshClaims(payload)) {
      return { status: 401, body: logoutFailBody() };
    }
    authRepository.revokeToken(payload.jti);
    authLog({
      event: "logout",
      user_id: payload.user_id,
      jti: payload.jti,
      client_platform: meta.client_platform,
      product: meta.product
    });
  }
  return { status: 200, body: { success: true } };
}

function verifyAccessToken(token) {
  if (!token) return null;
  const p = verifyJwt(token, getSecret());
  if (!isValidAccessClaims(p)) return null;
  return p;
}

module.exports = {
  ensureAuthEnv,
  handleAuthLogin,
  handleAuthRegister,
  handleAuthVerifyEmail,
  handleAuthResendVerification,
  handleAuthForgotPassword,
  handleAuthResetPassword,
  handleAuthRefresh,
  handleAuthMe,
  handleAuthLogout,
  verifyAccessToken
};
