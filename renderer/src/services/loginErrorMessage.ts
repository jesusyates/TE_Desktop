/**
 * D-7-5H：登录失败文案 — 透传后端 message，并对常见码做可读映射。
 */

import { isAxiosError } from "axios";
import { toUserFacingErrorMessage } from "./userFacingErrorMessage";

export type LoginErrorUiStrings = {
  errorGeneric: string;
  errorInvalidCredentials: string;
  errorInvalidEmailFormat: string;
  errorNetwork: string;
  errorEmailNotVerified: string;
  errorTooManyRequests: string;
  errorTooManyAttempts: string;
  resendCooldownWait: string;
  resendCooldownIn: string;
};

const RESEND_COOLDOWN_CODES = new Set([
  "RESEND_COOLDOWN",
  "VERIFICATION_RESEND_COOLDOWN",
  "RESET_RESEND_COOLDOWN"
]);

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

/**
 * MODULE C-6：登录失败唯一展示入口；不透传技术码/HTTP 缀尾。
 */
export function formatLoginErrorMessage(e: unknown, u: LoginErrorUiStrings): string {
  if (hasAuthCode(e, "EMAIL_NOT_VERIFIED")) return u.errorEmailNotVerified;
  if (hasAuthCode(e, "RESEND_COOLDOWN")) {
    const rs =
      e instanceof Error && "remainingSeconds" in e
        ? (e as Error & { remainingSeconds?: number }).remainingSeconds
        : undefined;
    if (typeof rs === "number" && rs > 0) return u.resendCooldownIn.replace("{n}", String(Math.ceil(rs)));
    return u.resendCooldownWait;
  }
  if (hasAuthCode(e, "TOO_MANY_REQUESTS")) return u.errorTooManyRequests;
  if (hasAuthCode(e, "TOO_MANY_ATTEMPTS")) return u.errorTooManyAttempts;
  if (hasAuthCode(e, "INVALID_EMAIL_FORMAT")) return u.errorInvalidEmailFormat;
  if (isAxiosError(e)) {
    const status = e.response?.status;
    const data = e.response?.data;
    if (data && typeof data === "object" && data !== null && "code" in data) {
      const c = String((data as { code: unknown }).code).trim();
      if (RESEND_COOLDOWN_CODES.has(c)) {
        const rs = (data as { remainingSeconds?: unknown }).remainingSeconds;
        const n = typeof rs === "number" && Number.isFinite(rs) ? Math.ceil(rs) : 0;
        if (n > 0) return u.resendCooldownIn.replace("{n}", String(n));
        return u.resendCooldownWait;
      }
      if (c === "TOO_MANY_REQUESTS") return u.errorTooManyRequests;
      if (c === "TOO_MANY_ATTEMPTS") return u.errorTooManyAttempts;
      if (c === "INVALID_EMAIL_FORMAT") return u.errorInvalidEmailFormat;
    }
    if (data && typeof data === "object" && data !== null && "success" in data && (data as { success: unknown }).success === false) {
      const m = "message" in data ? String((data as { message: unknown }).message).trim() : "";
      if (m) return toUserFacingErrorMessage(m);
    }
    const raw =
      data && typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message).trim()
        : "";
    if (raw === "invalid_credentials") return u.errorInvalidCredentials;
    if (raw && /^[\u4e00-\u9fff]/.test(raw)) return toUserFacingErrorMessage(raw);
    if (status === 401) return u.errorInvalidCredentials;
    if (!e.response || e.code === "ERR_NETWORK" || e.message === "Network Error") return u.errorNetwork;
    if (raw) return toUserFacingErrorMessage(raw);
    if (status != null) return toUserFacingErrorMessage(`http_${status}`);
    return toUserFacingErrorMessage(u.errorGeneric);
  }
  if (e instanceof Error && e.message.trim()) {
    return toUserFacingErrorMessage(e.message);
  }
  return toUserFacingErrorMessage(u.errorGeneric);
}

/** 验证 / 重发验证码：将后端中文 message 映射为当前语言的产品文案，其余走登录错误归一化。 */
export type VerifyEmailErrorUiStrings = LoginErrorUiStrings & {
  errorInvalidCode: string;
  errorAlreadyVerified: string;
  errorUserNotFound: string;
  errorResendNotApplicable: string;
  errorVerifyGeneric: string;
  emailRequired: string;
  codeRequired: string;
};

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
  return null;
}

export function formatVerifyEmailErrorMessage(e: unknown, u: VerifyEmailErrorUiStrings): string {
  if (e instanceof Error) {
    const mapped = mapBackendVerifyMessage(e.message, u);
    if (mapped) return mapped;
  }
  return formatLoginErrorMessage(e, u);
}

export type ResetPasswordErrorUiStrings = VerifyEmailErrorUiStrings & {
  errorNewPasswordShort: string;
  errorResetFailed: string;
};

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
