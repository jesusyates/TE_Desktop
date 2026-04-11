/**
 * MODULE C-1：认证 — 登录 / 注册（待邮箱验证）/ 验证邮箱后登录。
 */
import type { AuthSessionEnvelope } from "./authApi";
import {
  loginRequest,
  registerRequest,
  verifyEmailRequest,
  verifyEmailWithLinkToken,
  resendVerificationRequest,
  forgotPasswordRequest,
  resetPasswordRequest,
  resetPasswordWithRecoveryToken,
  fetchAuthMeValidated
} from "./authApi";
import { useAuthStore } from "../store/authStore";
import { isDisplayLocaleUserLocked } from "./displayLocale";

async function applyAuthSessionEnvelope(res: AuthSessionEnvelope): Promise<void> {
  if (!res.token?.trim() || !res.user?.userId) {
    throw new Error("无法完成登录，请稍后重试。");
  }
  const store = useAuthStore.getState();
  const rt = (res.refresh_token && String(res.refresh_token).trim()) || "";
  await store.setTokens(res.token, rt, {
    userId: res.user.userId,
    userEmail: res.user.email
  });
  /** 不与进入主界面串行：`/auth/me` 写入账户快照并补齐 market/locale，后台执行 */
  void (async () => {
    try {
      const me = await fetchAuthMeValidated();
      useAuthStore.getState().mergeAuthMeSuccess(me);
      if (!isDisplayLocaleUserLocked()) {
        const m = me.user.market;
        const l = me.user.locale;
        if (m && l) {
          useAuthStore.getState().setSessionLocale(m, l);
        }
      }
    } catch {
      /* 保持已有显示语言与市场 */
    }
  })();
}

/** 登录成功后将 token、refresh（若有）、user 写入 store，并尽力拉取 /auth/me */
export async function loginWithEmailPassword(email: string, password: string): Promise<void> {
  const res = await loginRequest(email.trim(), password);
  await applyAuthSessionEnvelope(res);
}

/** 注册：须完成邮箱验证后方可登录（正式闭环，不经 auto-confirm）。 */
export async function registerAccountOnly(email: string, password: string): Promise<{ email: string }> {
  const res = await registerRequest(email.trim(), password);
  return { email: res.email.trim() };
}

/** 邮箱验证成功后签发令牌并写入会话 */
export async function verifyEmailAndSignIn(email: string, code: string): Promise<void> {
  const res = await verifyEmailRequest(email.trim(), code.trim());
  await applyAuthSessionEnvelope(res);
}

/** 邮件确认链接内 token（与后端 `token_hash` 一致） */
export async function verifyEmailFromLinkToken(token_hash: string, type?: string): Promise<void> {
  const res = await verifyEmailWithLinkToken(token_hash.trim(), type);
  await applyAuthSessionEnvelope(res);
}

export async function resendVerificationEmail(email: string): Promise<void> {
  await resendVerificationRequest(email.trim());
}

export async function sendPasswordResetCode(email: string): Promise<void> {
  await forgotPasswordRequest(email.trim());
}

export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string
): Promise<boolean> {
  const session = await resetPasswordRequest(email.trim(), code.trim(), newPassword);
  if (session) {
    await applyAuthSessionEnvelope(session);
    return true;
  }
  return false;
}

/** 忘记密码邮件中的长 token（非 6 位 OTP） */
export async function resetPasswordFromMailToken(tokenHash: string, newPassword: string): Promise<boolean> {
  const session = await resetPasswordWithRecoveryToken(tokenHash.trim(), newPassword);
  if (session) {
    await applyAuthSessionEnvelope(session);
    return true;
  }
  return false;
}
