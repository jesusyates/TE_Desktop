/**
 * MODULE C-1：认证 — 登录 / 注册（待邮箱验证）/ 验证邮箱后登录。
 */
import type { AuthSessionEnvelope } from "./authApi";
import {
  loginRequest,
  registerRequest,
  verifyEmailRequest,
  resendVerificationRequest,
  forgotPasswordRequest,
  resetPasswordRequest,
  fetchAuthMe
} from "./authApi";
import { useAuthStore } from "../store/authStore";

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
  try {
    const me = await fetchAuthMe();
    store.setSessionLocale(me.user.market, me.user.locale);
  } catch {
    /* 市场/语言保持 store 既有默认即可 */
  }
}

/** 登录成功后将 token、refresh（若有）、user 写入 store，并尽力拉取 /auth/me */
export async function loginWithEmailPassword(email: string, password: string): Promise<void> {
  const res = await loginRequest(email.trim(), password);
  await applyAuthSessionEnvelope(res);
}

/** 注册：仅创建 pending_verification 用户并发码，不写入会话 */
export async function registerAccountOnly(email: string, password: string): Promise<{ email: string }> {
  const res = await registerRequest(email.trim(), password);
  return { email: res.email.trim() };
}

/** 邮箱验证成功后签发令牌并写入会话 */
export async function verifyEmailAndSignIn(email: string, code: string): Promise<void> {
  const res = await verifyEmailRequest(email.trim(), code.trim());
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
): Promise<void> {
  await resetPasswordRequest(email.trim(), code.trim(), newPassword);
}
