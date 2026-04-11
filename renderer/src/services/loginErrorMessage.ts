/**
 * 账号域错误：后端 / 客户端 authCode 与业务 code → 当前 locale 文案（禁止将 code 原文展示给用户）。
 */
import { isAxiosError } from "axios";
import type { UiCatalog } from "../i18n/uiCatalog";
import { toUserFacingErrorMessage } from "./userFacingErrorMessage";
import { formatAuthFailureDiagnostics, getAuthHttpContext } from "./authHttpDebug";

export type AuthErrorsUiStrings = UiCatalog["authErrors"];

export type LoginErrorUiStrings = {
  errorGeneric: string;
  errorInvalidCredentials: string;
  errorInvalidEmailFormat: string;
  errorNetwork: string;
  /** 兼容旧键名；格式化时优先使用 authErrors.EMAIL_NOT_VERIFIED */
  errorEmailNotVerified: string;
  errorTooManyRequests: string;
  errorTooManyAttempts: string;
  resendCooldownWait: string;
  resendCooldownIn: string;
  authErrors: AuthErrorsUiStrings;
};

const RESEND_COOLDOWN_CODES = new Set([
  "RESEND_COOLDOWN",
  "VERIFICATION_RESEND_COOLDOWN",
  "RESET_RESEND_COOLDOWN"
]);

export function buildAuthFlowErrorStrings(u: UiCatalog): LoginErrorUiStrings {
  return {
    errorGeneric: u.login.error,
    errorInvalidCredentials: u.login.errorInvalidCredentials,
    errorInvalidEmailFormat: u.login.errorInvalidEmailFormat,
    errorNetwork: u.login.errorNetwork,
    errorEmailNotVerified: u.login.errorEmailNotVerified,
    errorTooManyRequests: u.login.errorTooManyRequests,
    errorTooManyAttempts: u.login.errorTooManyAttempts,
    resendCooldownWait: u.login.resendCooldownWait,
    resendCooldownIn: u.login.resendCooldownIn,
    authErrors: u.authErrors
  };
}

/** 从服务端/客户端错误中读取重发冷却剩余秒数（若有）。 */
export function getResendCooldownSecondsFromError(e: unknown): number | null {
  if (e instanceof Error && "remainingSeconds" in e) {
    const n = (e as Error & { remainingSeconds?: number }).remainingSeconds;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return Math.ceil(n);
  }
  if (isAxiosError(e) && e.response?.data && typeof e.response.data === "object") {
    const d = e.response.data as Record<string, unknown>;
    const code = d.code != null ? String(d.code).trim() : "";
    if (RESEND_COOLDOWN_CODES.has(code)) {
      const rs = d.remainingSeconds;
      if (typeof rs === "number" && Number.isFinite(rs) && rs > 0) return Math.ceil(rs);
    }
  }
  return null;
}

export function hasAuthCode(e: unknown, code: string): boolean {
  return (
    e instanceof Error && "authCode" in e && (e as Error & { authCode?: string }).authCode === code
  );
}

function authCodeFromError(e: unknown): string | null {
  if (!(e instanceof Error)) return null;
  const ac = (e as Error & { authCode?: string }).authCode;
  return typeof ac === "string" && ac.trim() ? ac.trim() : null;
}

function looksLikeScreamingSnakeCode(s: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(String(s || "").trim());
}

function mapBizCode(code: string | undefined | null, u: LoginErrorUiStrings): string | null {
  if (code == null) return null;
  const k = String(code).trim();
  if (!k) return null;
  const ae = u.authErrors as Record<string, string>;
  if (Object.prototype.hasOwnProperty.call(ae, k) && typeof ae[k] === "string") return ae[k];
  return null;
}

function mapResendCooldownFromData(data: Record<string, unknown>, u: LoginErrorUiStrings): string | null {
  const c = "code" in data ? String((data as { code: unknown }).code).trim() : "";
  if (!RESEND_COOLDOWN_CODES.has(c)) return null;
  const rs = (data as { remainingSeconds?: unknown }).remainingSeconds;
  const n = typeof rs === "number" && Number.isFinite(rs) ? Math.ceil(rs) : 0;
  if (n > 0) return u.resendCooldownIn.replace("{n}", String(n));
  return u.resendCooldownWait;
}

/** 信封 message：仅信任中文产品句；其余英文/码类一律走兜底，避免技术原文上屏 */
function safeAuthApiMessage(raw: string, u: LoginErrorUiStrings): string {
  const t = raw.trim();
  if (!t) return u.authErrors.UNKNOWN_AUTH;
  if (/[\u4e00-\u9fff]/.test(t)) return t;
  if (looksLikeScreamingSnakeCode(t)) return mapBizCode(t, u) ?? u.authErrors.UNKNOWN_AUTH;
  if (/^[a-z][a-z0-9_]*$/i.test(t) && t.length <= 80) return u.authErrors.UNKNOWN_AUTH;
  return u.authErrors.UNKNOWN_AUTH;
}

function mapDataCodeBlock(
  data: Record<string, unknown>,
  u: LoginErrorUiStrings
): string | null {
  const cooldown = mapResendCooldownFromData(data, u);
  if (cooldown) return cooldown;
  if (!("code" in data)) return null;
  const c = String((data as { code: unknown }).code).trim();
  return mapBizCode(c, u);
}

/**
 * MODULE C-6：登录/注册等账号错误唯一展示入口；禁止展示 code 原文与英文技术句（非中文 envelope）。
 */
export function formatLoginErrorMessage(e: unknown, u: LoginErrorUiStrings): string {
  if (hasAuthCode(e, "RESEND_COOLDOWN")) {
    const rs =
      e instanceof Error && "remainingSeconds" in e
        ? (e as Error & { remainingSeconds?: number }).remainingSeconds
        : undefined;
    if (typeof rs === "number" && rs > 0) return u.resendCooldownIn.replace("{n}", String(Math.ceil(rs)));
    return u.resendCooldownWait;
  }

  const ac = authCodeFromError(e);
  if (ac) {
    const hit = mapBizCode(ac, u);
    if (hit) return hit;
    if (ac === "INVALID_CREDENTIALS") return u.errorInvalidCredentials;
    if (ac === "INVALID_EMAIL_FORMAT") return u.errorInvalidEmailFormat;
    if (ac === "TOO_MANY_REQUESTS") return u.errorTooManyRequests;
    if (ac === "TOO_MANY_ATTEMPTS") return u.errorTooManyAttempts;
    return u.authErrors.UNKNOWN_AUTH;
  }

  if (hasAuthCode(e, "INVALID_CREDENTIALS")) return u.errorInvalidCredentials;
  if (hasAuthCode(e, "INVALID_EMAIL_FORMAT")) return u.errorInvalidEmailFormat;
  if (hasAuthCode(e, "TOO_MANY_REQUESTS")) return u.errorTooManyRequests;
  if (hasAuthCode(e, "TOO_MANY_ATTEMPTS")) return u.errorTooManyAttempts;

  const httpCtx = getAuthHttpContext(e);
  if (httpCtx) {
    const data = httpCtx.responseBody;
    const status = httpCtx.status;
    if (status === 0) return u.errorNetwork;
    if (data && typeof data === "object" && data !== null) {
      const d = data as Record<string, unknown>;
      const fromCode = mapDataCodeBlock(d, u);
      if (fromCode) return fromCode;
      if ("success" in d && (d as { success: unknown }).success === false) {
        const m = "message" in d ? String((d as { message: unknown }).message).trim() : "";
        const c =
          "code" in d && (d as { code: unknown }).code != null
            ? String((d as { code: unknown }).code).trim()
            : "";
        const fromBiz = mapBizCode(c, u);
        if (fromBiz) return fromBiz;
        if (m) return safeAuthApiMessage(m, u);
      }
      const raw =
        "message" in d ? String((d as { message: unknown }).message).trim() : "";
      if (raw === "invalid_credentials") return u.errorInvalidCredentials;
      if (raw && /^[\u4e00-\u9fff]/.test(raw)) return raw;
    }
    if (status === 401) return u.errorInvalidCredentials;
    if (status != null && status >= 400 && status < 600) return u.authErrors.UNKNOWN_AUTH;
    if (e instanceof Error && e.message.trim()) {
      const m = e.message.trim();
      if (looksLikeScreamingSnakeCode(m)) return mapBizCode(m, u) ?? u.authErrors.UNKNOWN_AUTH;
      if (/[\u4e00-\u9fff]/.test(m)) return m;
      return u.authErrors.UNKNOWN_AUTH;
    }
    return u.errorGeneric;
  }

  if (isAxiosError(e)) {
    const status = e.response?.status;
    const data = e.response?.data;
    if (data && typeof data === "object" && data !== null) {
      const d = data as Record<string, unknown>;
      const fromCode = mapDataCodeBlock(d, u);
      if (fromCode) return fromCode;
      if ("success" in d && (d as { success: unknown }).success === false) {
        const m = "message" in d ? String((d as { message: unknown }).message).trim() : "";
        const c =
          "code" in d && (d as { code: unknown }).code != null
            ? String((d as { code: unknown }).code).trim()
            : "";
        const fromBiz = mapBizCode(c, u);
        if (fromBiz) return fromBiz;
        if (m) return safeAuthApiMessage(m, u);
      }
      const raw =
        "message" in d ? String((d as { message: unknown }).message).trim() : "";
      if (raw === "invalid_credentials") return u.errorInvalidCredentials;
      if (raw && /^[\u4e00-\u9fff]/.test(raw)) return raw;
    }
    if (status === 401) return u.errorInvalidCredentials;
    if (!e.response || e.code === "ERR_NETWORK" || e.message === "Network Error") return u.errorNetwork;
    if (status != null && status >= 400 && status < 600) return u.authErrors.UNKNOWN_AUTH;
    return u.errorGeneric;
  }

  if (e instanceof Error && e.message.trim()) {
    const m = e.message.trim();
    if (looksLikeScreamingSnakeCode(m)) return mapBizCode(m, u) ?? u.authErrors.UNKNOWN_AUTH;
    if (/[\u4e00-\u9fff]/.test(m)) return m;
    return u.authErrors.UNKNOWN_AUTH;
  }
  return u.errorGeneric;
}

/**
 * 与 formatLoginErrorMessage 一致；产品环境不展示 HTTP/诊断块。
 */
export function formatLoginErrorWithDiagnostics(e: unknown, u: LoginErrorUiStrings): string {
  const friendly = formatLoginErrorMessage(e, u);
  if (
    import.meta.env.DEV &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("AICS_SHOW_AUTH_DIAG_UI") === "1"
  ) {
    const diag = formatAuthFailureDiagnostics(e);
    return `${friendly}\n\n—— 诊断 ——\n${diag}`;
  }
  return friendly;
}

export type VerifyEmailErrorUiStrings = LoginErrorUiStrings & {
  errorInvalidCode: string;
  errorAlreadyVerified: string;
  errorUserNotFound: string;
  errorResendNotApplicable: string;
  errorResendVerificationFailed: string;
  errorVerifyGeneric: string;
  emailRequired: string;
  codeRequired: string;
};

export function buildVerifyEmailErrorStrings(catalog: UiCatalog): VerifyEmailErrorUiStrings {
  const u = catalog;
  const v = u.verifyEmail;
  return {
    ...buildAuthFlowErrorStrings(u),
    errorInvalidCode: v.errorInvalidCode,
    errorAlreadyVerified: v.errorAlreadyVerified,
    errorUserNotFound: v.errorUserNotFound,
    errorResendNotApplicable: v.errorResendNotApplicable,
    errorResendVerificationFailed: v.errorResendVerificationFailed,
    errorVerifyGeneric: v.errorVerifyGeneric,
    emailRequired: v.emailRequired,
    codeRequired: v.codeRequired
  };
}

function mapBackendVerifyMessage(raw: string, u: VerifyEmailErrorUiStrings): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.includes("邮箱格式")) return u.errorInvalidEmailFormat;
  if (t.includes("验证码无效") || t.includes("已过期")) return u.errorInvalidCode;
  if (t.includes("已验证") || t.includes("状态异常")) return u.errorAlreadyVerified;
  if (t.includes("用户不存在")) return u.errorUserNotFound;
  if (t.includes("无需重新发送")) return u.errorResendNotApplicable;
  if (t.includes("请填写邮箱") || t.includes("请填写邮箱地址")) return u.emailRequired;
  if (t.includes("6 位验证码")) return u.codeRequired;
  if (/invalid_otp|INVALID_OTP|wrong.*code|invalid.*code/i.test(t)) return u.authErrors.INVALID_OTP;
  if (/OTP_EXPIRED|CODE_EXPIRED|expired.*otp/i.test(t)) return u.authErrors.OTP_EXPIRED;
  return null;
}

export function formatVerifyEmailErrorMessage(e: unknown, u: VerifyEmailErrorUiStrings): string {
  if (hasAuthCode(e, "EMAIL_ALREADY_VERIFIED_LOGIN")) return u.errorAlreadyVerified;
  if (hasAuthCode(e, "RESEND_VERIFICATION_FAILED")) return u.authErrors.RESEND_VERIFICATION_FAILED;
  if (hasAuthCode(e, "INVALID_OTP")) return u.authErrors.INVALID_OTP;
  if (hasAuthCode(e, "OTP_EXPIRED")) return u.authErrors.OTP_EXPIRED;
  if (hasAuthCode(e, "UPSTREAM_ERROR")) return u.authErrors.UPSTREAM_ERROR;
  if (e instanceof Error) {
    const mapped = mapBackendVerifyMessage(e.message, u);
    if (mapped) return mapped;
  }
  return formatLoginErrorMessage(e, u);
}

export function formatVerifyEmailErrorWithDiagnostics(e: unknown, u: VerifyEmailErrorUiStrings): string {
  const friendly = formatVerifyEmailErrorMessage(e, u);
  if (
    import.meta.env.DEV &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem("AICS_SHOW_AUTH_DIAG_UI") === "1"
  ) {
    const diag = formatAuthFailureDiagnostics(e);
    return `${friendly}\n\n—— 诊断 ——\n${diag}`;
  }
  return friendly;
}

export type ResetPasswordErrorUiStrings = VerifyEmailErrorUiStrings & {
  errorNewPasswordShort: string;
  errorResetFailed: string;
};

export function buildResetPasswordErrorStrings(catalog: UiCatalog): ResetPasswordErrorUiStrings {
  const u = catalog;
  const rp = u.resetPassword;
  return {
    ...buildVerifyEmailErrorStrings(catalog),
    errorNewPasswordShort: rp.errorNewPasswordShort,
    errorResetFailed: rp.errorResetFailed,
    errorVerifyGeneric: rp.errorVerifyGeneric,
    emailRequired: rp.emailRequired,
    codeRequired: rp.codeRequired,
    errorInvalidCode: rp.errorInvalidCode,
    errorAlreadyVerified: rp.errorAlreadyVerified,
    errorUserNotFound: rp.errorUserNotFound,
    errorResendNotApplicable: rp.errorResendNotApplicable,
    errorResendVerificationFailed: u.verifyEmail.errorResendVerificationFailed
  };
}

function mapBackendResetMessage(raw: string, u: ResetPasswordErrorUiStrings): string | null {
  const t = raw.trim();
  if (!t) return null;
  const fromVerify = mapBackendVerifyMessage(raw, u);
  if (fromVerify) return fromVerify;
  if (t.includes("新密码") && t.includes("8")) return u.errorNewPasswordShort;
  if (t.includes("重置失败")) return u.errorResetFailed;
  return null;
}

export function formatResetPasswordErrorMessage(e: unknown, u: ResetPasswordErrorUiStrings): string {
  if (e instanceof Error) {
    const mapped = mapBackendResetMessage(e.message, u);
    if (mapped) return mapped;
  }
  return formatLoginErrorMessage(e, u);
}
