import axios, { isAxiosError } from "axios";
import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { CLIENT_VERSION } from "../config/clientVersion";
import { clientSession } from "./clientSession";

const baseURL = SHARED_CORE_BASE_URL;

/** 登录 / 刷新不走受保护 apiClient，避免与业务请求拦截器耦合。 */
export const authApiClient = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "X-Client-Product": "aics",
    "X-Client-Platform": "desktop"
  }
});

authApiClient.interceptors.request.use(async (config) => {
  const market = await clientSession.getMarket();
  const locale = await clientSession.getLocale();
  config.headers["X-Client-Platform"] = "desktop";
  config.headers["X-Client-Market"] = market;
  config.headers["X-Client-Preference-Market"] = market;
  config.headers["X-Client-Preference-Locale"] = locale;
  config.headers["X-Client-Version"] = CLIENT_VERSION;
  return config;
});

/** MODULE C-1/C-注册：`POST /auth/login` 与 `POST /auth/register` 成功体（refresh 供客户端可选持久化）。 */
export type AuthSessionEnvelope = {
  success: true;
  token: string;
  refresh_token?: string;
  user: { userId: string; email: string };
};

/** @deprecated 使用 AuthSessionEnvelope */
export type LoginResponseC1 = AuthSessionEnvelope;

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  user: {
    user_id: string;
    email: string;
    market: string;
    locale: string;
    product?: string;
    client_platform?: string;
  };
};

function readLoginFailureMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.success === false && typeof o.message === "string" && o.message.trim()) {
    return o.message.trim();
  }
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  return null;
}

/**
 * MODULE C-1：`POST /auth/login` — 仅处理 C-1 信封；失败抛错（message 为用户可读文案为主）
 */
function isAuthSessionSuccess(data: unknown): data is AuthSessionEnvelope {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  if (o.success !== true) return false;
  if (typeof o.token !== "string" || !String(o.token).trim()) return false;
  const u = o.user;
  if (!u || typeof u !== "object") return false;
  const user = u as Record<string, unknown>;
  return typeof user.userId === "string" && Boolean(String(user.userId).trim()) && typeof user.email === "string";
}

function throwAuthErrorFromResponseData(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const d = data as Record<string, unknown>;
  const msg =
    typeof d.message === "string" && d.message.trim() ? d.message.trim() : "";
  if (d.code === "EMAIL_NOT_VERIFIED") {
    const err = new Error(msg || "EMAIL_NOT_VERIFIED") as Error & { authCode?: string };
    err.authCode = "EMAIL_NOT_VERIFIED";
    throw err;
  }
  if (d.code === "TOO_MANY_REQUESTS" || d.code === "TOO_MANY_ATTEMPTS") {
    const code = String(d.code);
    const err = new Error(msg || code) as Error & { authCode?: string };
    err.authCode = code;
    throw err;
  }
  if (d.code === "INVALID_EMAIL_FORMAT") {
    const err = new Error(msg || "INVALID_EMAIL_FORMAT") as Error & { authCode?: string };
    err.authCode = "INVALID_EMAIL_FORMAT";
    throw err;
  }
  const cooldownCode =
    d.code === "RESEND_COOLDOWN" ||
    d.code === "VERIFICATION_RESEND_COOLDOWN" ||
    d.code === "RESET_RESEND_COOLDOWN";
  if (cooldownCode) {
    const rsRaw = d.remainingSeconds;
    const rs =
      typeof rsRaw === "number" && Number.isFinite(rsRaw) ? Math.max(0, Math.ceil(rsRaw)) : 0;
    const err = new Error(msg || "RESEND_COOLDOWN") as Error & {
      authCode?: string;
      remainingSeconds?: number;
    };
    err.authCode = "RESEND_COOLDOWN";
    err.remainingSeconds = rs;
    throw err;
  }
}

export async function loginRequest(email: string, password: string): Promise<AuthSessionEnvelope> {
  try {
    const { data } = await authApiClient.post<AuthSessionEnvelope | { success: false; message: string }>(
      "/auth/login",
      { email, password }
    );
    if (isAuthSessionSuccess(data)) {
      return data;
    }
    throwAuthErrorFromResponseData(data);
    const msg = readLoginFailureMessage(data) || "无法完成登录，请稍后重试。";
    throw new Error(msg);
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      const msg = readLoginFailureMessage(e.response.data);
      if (msg) throw new Error(msg);
    }
    throw e;
  }
}

export type RegisterPendingEnvelope = {
  success: true;
  needsVerification: true;
  email: string;
};

function isRegisterPending(data: unknown): data is RegisterPendingEnvelope {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  return (
    o.success === true &&
    o.needsVerification === true &&
    typeof o.email === "string" &&
    Boolean(String(o.email).trim())
  );
}

export type RegisterUnverifiedExistingError = Error & {
  authCode: "EMAIL_ALREADY_EXISTS_UNVERIFIED";
  registerEmail: string;
};

function throwRegisterUnverifiedExisting(emailNorm: string): never {
  const err = new Error("EMAIL_ALREADY_EXISTS_UNVERIFIED") as RegisterUnverifiedExistingError;
  err.authCode = "EMAIL_ALREADY_EXISTS_UNVERIFIED";
  err.registerEmail = emailNorm.trim();
  throw err;
}

export function isRegisterUnverifiedExistingError(e: unknown): e is RegisterUnverifiedExistingError {
  return (
    e instanceof Error &&
    "authCode" in e &&
    (e as Error & { authCode?: string }).authCode === "EMAIL_ALREADY_EXISTS_UNVERIFIED" &&
    "registerEmail" in e &&
    typeof (e as Error & { registerEmail?: unknown }).registerEmail === "string" &&
    Boolean(String((e as RegisterUnverifiedExistingError).registerEmail).trim())
  );
}

export async function registerRequest(email: string, password: string): Promise<RegisterPendingEnvelope> {
  try {
    const market = await clientSession.getMarket();
    const locale = await clientSession.getLocale();
    const { status, data } = await authApiClient.post<
      | RegisterPendingEnvelope
      | AuthSessionEnvelope
      | {
          success: false;
          message: string;
          code?: string;
          emailVerified?: boolean;
          email?: string;
        }
    >("/auth/register", { email, password, market, locale }, { validateStatus: () => true });

    if (status === 201 && isRegisterPending(data)) {
      return data;
    }

    if (status === 409 && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (
        d.code === "EMAIL_ALREADY_EXISTS" &&
        d.emailVerified === false &&
        typeof d.email === "string" &&
        d.email.trim()
      ) {
        throwRegisterUnverifiedExisting(String(d.email));
      }
    }

    if (data && typeof data === "object") {
      throwAuthErrorFromResponseData(data);
    }
    const msg =
      (data && typeof data === "object" && readLoginFailureMessage(data)) ||
      "无法完成注册，请稍后重试。";
    throw new Error(msg);
  } catch (e) {
    if (isRegisterUnverifiedExistingError(e)) throw e;
    if (isAxiosError(e) && e.response?.data) {
      const d = e.response.data;
      if (e.response.status === 409 && d && typeof d === "object") {
        const o = d as Record<string, unknown>;
        if (
          o.code === "EMAIL_ALREADY_EXISTS" &&
          o.emailVerified === false &&
          typeof o.email === "string" &&
          o.email.trim()
        ) {
          throwRegisterUnverifiedExisting(String(o.email));
        }
      }
      throwAuthErrorFromResponseData(d);
      const msg = readLoginFailureMessage(d);
      if (msg) throw new Error(msg);
    }
    throw e;
  }
}

export async function verifyEmailRequest(email: string, code: string): Promise<AuthSessionEnvelope> {
  try {
    const { data } = await authApiClient.post<AuthSessionEnvelope | { success: false; message: string }>(
      "/auth/verify-email",
      { email, code }
    );
    if (isAuthSessionSuccess(data)) {
      return data;
    }
    const msg = readLoginFailureMessage(data) || "验证失败，请稍后重试。";
    throw new Error(msg);
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      const msg = readLoginFailureMessage(e.response.data);
      if (msg) throw new Error(msg);
    }
    throw e;
  }
}

export async function resendVerificationRequest(email: string): Promise<void> {
  try {
    const { data } = await authApiClient.post<{ success: true } | { success: false; message: string }>(
      "/auth/resend-verification",
      { email }
    );
    if (data && typeof data === "object" && "success" in data && data.success === true) {
      return;
    }
    const msg = readLoginFailureMessage(data) || "发送失败，请稍后重试。";
    throw new Error(msg);
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      const msg = readLoginFailureMessage(e.response.data);
      if (msg) throw new Error(msg);
    }
    throw e;
  }
}

/** 忘记密码：服务端对是否存在邮箱统一成功，不根据响应推断注册情况。 */
export async function forgotPasswordRequest(email: string): Promise<void> {
  try {
    const { data } = await authApiClient.post<{ success: true } | { success: false; message: string }>(
      "/auth/forgot-password",
      { email: email.trim() }
    );
    if (data && typeof data === "object" && "success" in data && data.success === true) {
      return;
    }
    const msg = readLoginFailureMessage(data) || "请求失败，请稍后重试。";
    throw new Error(msg);
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      const msg = readLoginFailureMessage(e.response.data);
      if (msg) throw new Error(msg);
    }
    throw e;
  }
}

export async function resetPasswordRequest(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  try {
    const { data } = await authApiClient.post<{ success: true } | { success: false; message: string }>(
      "/auth/reset-password",
      { email: email.trim(), code: code.trim(), newPassword }
    );
    if (data && typeof data === "object" && "success" in data && data.success === true) {
      return;
    }
    const msg = readLoginFailureMessage(data) || "重置失败，请稍后重试。";
    throw new Error(msg);
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      const msg = readLoginFailureMessage(e.response.data);
      if (msg) throw new Error(msg);
    }
    throw e;
  }
}

export async function refreshRequest(refreshToken: string): Promise<LoginResponse> {
  const { status, data } = await authApiClient.post<LoginResponse & { success?: boolean }>(
    "/auth/refresh",
    { refresh_token: refreshToken },
    { validateStatus: () => true }
  );
  const d = data && typeof data === "object" ? data : null;
  const at = d && "access_token" in d ? String((d as LoginResponse).access_token || "").trim() : "";
  const rt = d && "refresh_token" in d ? String((d as LoginResponse).refresh_token || "").trim() : "";
  const uid =
    d && "user" in d && d.user && typeof d.user === "object"
      ? String((d.user as { user_id?: string }).user_id || "").trim()
      : "";
  if (status === 200 && at && rt && uid) {
    return d as LoginResponse;
  }
  throw new Error("refresh_failed");
}

export type LogoutResponseBody = { success: true } | { success: false; message: string };

/**
 * MODULE C-4：通知服务端撤销 refresh（若有）；网络/业务失败不抛错，由调用方仍清理本地。
 */
export async function logoutRequest(refreshToken: string | undefined | null): Promise<void> {
  const rt = refreshToken != null && String(refreshToken).trim() ? String(refreshToken).trim() : "";
  try {
    const { status, data } = await authApiClient.post<LogoutResponseBody>(
      "/auth/logout",
      { refresh_token: rt },
      { validateStatus: () => true }
    );
    if (status >= 200 && status < 300 && data && typeof data === "object" && (data as { success?: boolean }).success === true) {
      return;
    }
  } catch {
    /* 离线等：本地登出仍继续 */
  }
}

/** MODULE C-3：/auth/me 业务失败；`clearVault` 表示是否应清空本地令牌。 */
export class AuthMeFailure extends Error {
  readonly clearVault: boolean;

  constructor(message: string, clearVault: boolean) {
    super(message);
    this.name = "AuthMeFailure";
    this.clearVault = clearVault;
  }
}

export type AuthMeSuccessBody = {
  success: true;
  user: {
    userId: string;
    email: string;
    market?: string;
    locale?: string;
    product?: string;
    client_platform?: string;
  };
};

type AuthMeEnvelope = AuthMeSuccessBody | { success: false; message: string };

function isAuthMeSuccessBody(data: unknown): data is AuthMeSuccessBody {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  if (o.success !== true) return false;
  const u = o.user;
  if (!u || typeof u !== "object") return false;
  const user = u as Record<string, unknown>;
  return typeof user.userId === "string" && user.userId.trim().length > 0 && typeof user.email === "string";
}

/**
 * MODULE C-3：解析 /auth/me 信封；无效会话时 `clearVault === true`（网络/5xx 不清vault）。
 */
export async function fetchAuthMeValidated(): Promise<AuthMeSuccessBody> {
  const { apiClient } = await import("./apiClient");
  const runOnce = async (afterRefreshRetry: boolean): Promise<AuthMeSuccessBody> => {
    let status = 0;
    let data: unknown;
    try {
      const res = await apiClient.get<AuthMeEnvelope>("/auth/me", { validateStatus: () => true });
      status = res.status;
      data = res.data;
    } catch (e) {
      if (isAxiosError(e) && e.response == null) {
        throw new AuthMeFailure("网络异常，请稍后重试。", false);
      }
      throw e;
    }

    if (status === 200 && isAuthMeSuccessBody(data)) {
      return data;
    }

    if (status === 401 && !afterRefreshRetry) {
      const { tryRefreshSession } = await import("./authSilentRefresh");
      const ok = await tryRefreshSession();
      if (ok) return runOnce(true);
    }

    let message = "登录已失效";
    if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
      const m = String((data as { message: string }).message).trim();
      if (m) message = m;
    }

    let clearVault = false;
    if (status >= 500) clearVault = false;
    else if (status === 401) clearVault = true;
    else if (status === 403) clearVault = false;
    else if (status === 400) clearVault = false;
    else if (status === 200 && data && typeof data === "object" && (data as { success?: unknown }).success === false) {
      clearVault = true;
    } else if (status >= 200 && status < 500) clearVault = true;

    throw new AuthMeFailure(message, clearVault);
  };

  return runOnce(false);
}

/**
 * MODULE C-2/C-3：须在 vault 已有 access 之后调用；返回 legacy `user_id` 形状以兼容既有调用方。
 */
export async function fetchAuthMe(): Promise<{
  user: { user_id: string; email: string; market: string; locale: string; product?: string; client_platform?: string };
}> {
  const r = await fetchAuthMeValidated();
  return {
    user: {
      user_id: r.user.userId,
      email: r.user.email,
      market: r.user.market ?? "global",
      locale: r.user.locale ?? "en-US",
      ...(r.user.product != null ? { product: r.user.product } : {}),
      ...(r.user.client_platform != null ? { client_platform: r.user.client_platform } : {})
    }
  };
}
