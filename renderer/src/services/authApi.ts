import axios, { isAxiosError, type InternalAxiosRequestConfig } from "axios";
import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { CLIENT_VERSION } from "../config/clientVersion";
import { clientSession } from "./clientSession";
import { normalizeV1ResponseBody } from "./v1Envelope";
import { logAxiosFailure } from "./apiErrorLog";
import {
  attachAuthHttpContext,
  buildAuthFullUrl,
  logAuthHttpRequest,
  logAuthHttpResponseError,
  logAuthHttpResponseSuccess,
  throwAuthHttpContextError
} from "./authHttpDebug";

const baseURL = SHARED_CORE_BASE_URL;

/** 正式 Auth 链：shared-core-backend `POST|GET /v1/auth/*` */
const AUTH_V1 = "/v1/auth";

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
  config.headers["X-Client-Locale"] = locale;
  config.headers["X-Client-Preference-Market"] = market;
  config.headers["X-Client-Preference-Locale"] = locale;
  config.headers["X-Client-Version"] = CLIENT_VERSION;
  config.headers["X-Client-Product"] = "aics";
  return config;
});

authApiClient.interceptors.request.use((config) => {
  logAuthHttpRequest(config);
  return config;
});

authApiClient.interceptors.response.use(
  (r) => {
    logAuthHttpResponseSuccess(r);
    return r;
  },
  (err) => {
    logAuthHttpResponseError(err);
    logAxiosFailure("auth", err);
    return Promise.reject(err);
  }
);

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

function mkAuthCodeError(): Error & { authCode?: string } {
  return new Error("") as Error & { authCode?: string };
}

/** UI 走 i18n；禁止把业务 code 或英文技术句塞进 Error.message */
function throwAuthErrorFromResponseData(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const d = data as Record<string, unknown>;
  const msg =
    typeof d.message === "string" && d.message.trim() ? d.message.trim() : "";

  /** `/v1/auth/*` 错误体常为 `FORBIDDEN` + 文案，映射未验证邮箱 */
  if (
    d.code === "FORBIDDEN" &&
    msg &&
    (/验证|verification|verify/i.test(msg) || msg.includes("邮箱"))
  ) {
    const err = mkAuthCodeError();
    err.authCode = "EMAIL_NOT_VERIFIED";
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
    const err = new Error("") as Error & {
      authCode?: string;
      remainingSeconds?: number;
    };
    err.authCode = "RESEND_COOLDOWN";
    err.remainingSeconds = rs;
    throw err;
  }

  if (d.success === false) {
    const err = mkAuthCodeError();
    const c = typeof d.code === "string" && d.code.trim() ? d.code.trim() : "";
    err.authCode = c || "UPSTREAM_ERROR";
    throw err;
  }
}

function throwUpstreamAuth(): never {
  const err = mkAuthCodeError();
  err.authCode = "UPSTREAM_ERROR";
  throw err;
}

function throwEmailAlreadyVerifiedLogin(): never {
  const err = mkAuthCodeError();
  err.authCode = "EMAIL_ALREADY_VERIFIED_LOGIN";
  throw err;
}

export async function loginRequest(email: string, password: string): Promise<AuthSessionEnvelope> {
  try {
    const { status, data: raw } = await authApiClient.post<unknown>(
      `${AUTH_V1}/login`,
      { email, password },
      { validateStatus: () => true }
    );
    const data = normalizeV1ResponseBody(raw);
    if (status === 200 && isAuthSessionSuccess(data)) {
      return data;
    }
    const top = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (top && top.success === false) {
      throwAuthErrorFromResponseData(top);
    }
    throwAuthErrorFromResponseData(data);
    throwUpstreamAuth();
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      throwUpstreamAuth();
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
  const err = new Error("") as RegisterUnverifiedExistingError;
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

export type RegisterVerifiedExistingError = Error & { authCode: "EMAIL_ALREADY_EXISTS_VERIFIED" };

function throwRegisterVerifiedExisting(): never {
  const err = new Error("") as RegisterVerifiedExistingError;
  err.authCode = "EMAIL_ALREADY_EXISTS_VERIFIED";
  throw err;
}

export function isRegisterVerifiedExistingError(e: unknown): e is RegisterVerifiedExistingError {
  return (
    e instanceof Error &&
    "authCode" in e &&
    (e as Error & { authCode?: string }).authCode === "EMAIL_ALREADY_EXISTS_VERIFIED"
  );
}

export type RegisterResult = RegisterPendingEnvelope;

function registerFailureContext(status: number, config: InternalAxiosRequestConfig, raw: unknown) {
  return {
    status,
    requestUrl: buildAuthFullUrl(config),
    method: String(config.method ?? "POST").toUpperCase(),
    responseBody: raw
  };
}

export async function registerRequest(email: string, password: string): Promise<RegisterResult> {
  const emailNorm = email.trim().toLowerCase();
  try {
    const market = await clientSession.getMarket();
    const locale = await clientSession.getLocale();
    const res = await authApiClient.post<unknown>(
      `${AUTH_V1}/register`,
      { email, password, market, locale },
      { validateStatus: () => true }
    );
    const { status, data: raw, config } = res;
    const data = normalizeV1ResponseBody(raw);

    if (status === 201 && isRegisterPending(data)) {
      return data;
    }

    if (status === 409 && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if (d.code === "EMAIL_ALREADY_EXISTS" && d.emailVerified === true) {
        throwRegisterVerifiedExisting();
      }
      if (
        d.code === "EMAIL_ALREADY_EXISTS" &&
        d.emailVerified === false &&
        typeof d.email === "string" &&
        d.email.trim()
      ) {
        throwRegisterUnverifiedExisting(String(d.email));
      }
    }

    if (status === 409) {
      const reg409Msg =
        data != null && typeof data === "object" ? readLoginFailureMessage(data) : null;
      const msg409 = reg409Msg ?? "";
      if (/已注册.*直接登录|already registered|sign in/i.test(msg409)) {
        throwRegisterVerifiedExisting();
      }
      if (/尚未验证|未验证|verification|verify/i.test(msg409)) {
        throwRegisterUnverifiedExisting(String(emailNorm));
      }
    }

    if (data && typeof data === "object") {
      try {
        throwAuthErrorFromResponseData(data);
      } catch (rethrow) {
        if (rethrow instanceof Error) {
          attachAuthHttpContext(rethrow, registerFailureContext(status, config, raw));
        }
        throw rethrow;
      }
    }
    throwAuthHttpContextError("", registerFailureContext(status, config, raw));
  } catch (e) {
    if (isRegisterVerifiedExistingError(e)) throw e;
    if (isRegisterUnverifiedExistingError(e)) throw e;
    if (isAxiosError(e) && e.response?.data) {
      const d = e.response.data;
      if (e.response.status === 409 && d && typeof d === "object") {
        const o = d as Record<string, unknown>;
        if (o.code === "EMAIL_ALREADY_EXISTS" && o.emailVerified === true) {
          throwRegisterVerifiedExisting();
        }
        if (
          o.code === "EMAIL_ALREADY_EXISTS" &&
          o.emailVerified === false &&
          typeof o.email === "string" &&
          o.email.trim()
        ) {
          throwRegisterUnverifiedExisting(String(o.email));
        }
        const msgFlat = readLoginFailureMessage(d) || "";
        if (/已注册.*直接登录|already registered|sign in/i.test(msgFlat)) {
          throwRegisterVerifiedExisting();
        }
        if (/尚未验证|未验证|verification|verify/i.test(msgFlat)) {
          throwRegisterUnverifiedExisting(String(emailNorm));
        }
      }
      throwAuthErrorFromResponseData(d);
      const cfg = e.config;
      throwAuthHttpContextError("", {
        status: e.response.status,
        requestUrl: cfg ? buildAuthFullUrl(cfg) : `${baseURL}${AUTH_V1}/register`,
        method: String(cfg?.method ?? "POST").toUpperCase(),
        responseBody: d
      });
    }
    throw e;
  }
}

export async function verifyEmailRequest(email: string, code: string): Promise<AuthSessionEnvelope> {
  try {
    const { status, data: raw } = await authApiClient.post<unknown>(
      `${AUTH_V1}/verify-email`,
      { email, code },
      { validateStatus: () => true }
    );
    const data = normalizeV1ResponseBody(raw);
    if (status === 200 && isAuthSessionSuccess(data)) {
      return data;
    }
    if (
      status === 200 &&
      data &&
      typeof data === "object" &&
      (data as { success?: boolean }).success === true
    ) {
      throwEmailAlreadyVerifiedLogin();
    }
    const top = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (top && top.success === false) {
      throwAuthErrorFromResponseData(top);
    }
    throwAuthErrorFromResponseData(data);
    throwUpstreamAuth();
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      throwUpstreamAuth();
    }
    throw e;
  }
}

/** 邮件内 magic link：`token` / `token_hash` + 可选 `type`（signup | email | magiclink） */
export async function verifyEmailWithLinkToken(
  token_hash: string,
  type?: string
): Promise<AuthSessionEnvelope> {
  try {
    const { status, data: raw } = await authApiClient.post<unknown>(
      `${AUTH_V1}/verify-email`,
      {
        token_hash: token_hash.trim(),
        ...(type != null && String(type).trim() ? { type: String(type).trim() } : {})
      },
      { validateStatus: () => true }
    );
    const data = normalizeV1ResponseBody(raw);
    if (status === 200 && isAuthSessionSuccess(data)) {
      return data;
    }
    if (
      status === 200 &&
      data &&
      typeof data === "object" &&
      (data as { success?: boolean }).success === true
    ) {
      throwEmailAlreadyVerifiedLogin();
    }
    const top = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (top && top.success === false) {
      throwAuthErrorFromResponseData(top);
    }
    throwAuthErrorFromResponseData(data);
    throwUpstreamAuth();
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      throwUpstreamAuth();
    }
    throw e;
  }
}

function isResendEnvelopeSuccess(status: number, raw: unknown, normalized: unknown): boolean {
  if (status !== 200) return false;
  if (
    normalized &&
    typeof normalized === "object" &&
    (normalized as { success?: boolean }).success === true
  ) {
    return true;
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (o.success === true && o.data && typeof o.data === "object") {
      const inner = o.data as Record<string, unknown>;
      if (inner.success === true) return true;
    }
  }
  return false;
}

/**
 * POST /v1/auth/resend-verification — validateStatus 全放行，避免 Axios 吞掉业务体；失败带 authHttpContext 供 UI 诊断。
 */
export async function resendVerificationRequest(email: string): Promise<void> {
  try {
    const res = await authApiClient.post<unknown>(
      `${AUTH_V1}/resend-verification`,
      { email },
      { validateStatus: () => true }
    );
    const { status, data: raw, config } = res;
    const data = normalizeV1ResponseBody(raw);

    if (isResendEnvelopeSuccess(status, raw, data)) {
      return;
    }

    const top = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

    if (data && typeof data === "object") {
      try {
        throwAuthErrorFromResponseData(data);
      } catch (rethrow) {
        if (rethrow instanceof Error) {
          attachAuthHttpContext(rethrow, {
            status,
            requestUrl: buildAuthFullUrl(config),
            method: "POST",
            responseBody: raw
          });
        }
        throw rethrow;
      }
    }
    if (top) {
      try {
        throwAuthErrorFromResponseData(top);
      } catch (rethrow) {
        if (rethrow instanceof Error) {
          attachAuthHttpContext(rethrow, {
            status,
            requestUrl: buildAuthFullUrl(config),
            method: "POST",
            responseBody: raw
          });
        }
        throw rethrow;
      }
    }

    throwAuthHttpContextError("", {
      status,
      requestUrl: buildAuthFullUrl(config),
      method: "POST",
      responseBody: raw
    });
  } catch (e) {
    if (isAxiosError(e) && e.request && !e.response) {
      throwAuthHttpContextError("", {
        status: 0,
        requestUrl: e.config ? buildAuthFullUrl(e.config) : `${baseURL}${AUTH_V1}/resend-verification`,
        method: "POST",
        responseBody: { axiosCode: e.code ?? null, message: e.message }
      });
    }
    throw e;
  }
}

/** 忘记密码：服务端对是否存在邮箱统一成功，不根据响应推断注册情况。 */
export async function forgotPasswordRequest(email: string): Promise<void> {
  try {
    const { data: raw } = await authApiClient.post<unknown>(`${AUTH_V1}/forgot-password`, {
      email: email.trim()
    });
    const data = normalizeV1ResponseBody(raw);
    if (data && typeof data === "object" && "success" in data && (data as { success?: boolean }).success === true) {
      return;
    }
    throwAuthErrorFromResponseData(data);
    throwUpstreamAuth();
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      throwUpstreamAuth();
    }
    throw e;
  }
}

/**
 * 邮箱 OTP：`email` + `code`；成功时若服务端返回 session 则一并解析。
 */
export async function resetPasswordRequest(
  email: string,
  code: string,
  newPassword: string
): Promise<AuthSessionEnvelope | null> {
  try {
    const { status, data: raw } = await authApiClient.post<unknown>(
      `${AUTH_V1}/reset-password`,
      {
        email: email.trim(),
        code: code.trim(),
        newPassword
      },
      { validateStatus: () => true }
    );
    const data = normalizeV1ResponseBody(raw);
    if (status === 200 && data && typeof data === "object" && (data as { success?: boolean }).success === true) {
      if (isAuthSessionSuccess(data)) {
        return data;
      }
      return null;
    }
    const top = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (top && top.success === false) {
      throwAuthErrorFromResponseData(top);
    }
    throwAuthErrorFromResponseData(data);
    throwUpstreamAuth();
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      throwUpstreamAuth();
    }
    throw e;
  }
}

/** 邮件 recovery magic link：`token_hash`（可与 Supabase 回调 query 对齐） */
export async function resetPasswordWithRecoveryToken(
  tokenHash: string,
  newPassword: string
): Promise<AuthSessionEnvelope | null> {
  try {
    const { status, data: raw } = await authApiClient.post<unknown>(
      `${AUTH_V1}/reset-password`,
      {
        token_hash: tokenHash.trim(),
        newPassword
      },
      { validateStatus: () => true }
    );
    const data = normalizeV1ResponseBody(raw);
    if (status === 200 && data && typeof data === "object" && (data as { success?: boolean }).success === true) {
      if (isAuthSessionSuccess(data)) {
        return data;
      }
      return null;
    }
    const top = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (top && top.success === false) {
      throwAuthErrorFromResponseData(top);
    }
    throwAuthErrorFromResponseData(data);
    throwUpstreamAuth();
  } catch (e) {
    if (isAxiosError(e) && e.response?.data) {
      throwAuthErrorFromResponseData(e.response.data);
      throwUpstreamAuth();
    }
    throw e;
  }
}

export async function refreshRequest(refreshToken: string): Promise<LoginResponse> {
  const { status, data: raw } = await authApiClient.post<unknown>(
    `${AUTH_V1}/refresh`,
    { refresh_token: refreshToken },
    { validateStatus: () => true }
  );
  const data = normalizeV1ResponseBody(raw);
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const at = d && "access_token" in d ? String((d as unknown as LoginResponse).access_token || "").trim() : "";
  const rt = d && "refresh_token" in d ? String((d as unknown as LoginResponse).refresh_token || "").trim() : "";
  const uid =
    d && "user" in d && d.user && typeof d.user === "object"
      ? String((d.user as { user_id?: string }).user_id || "").trim()
      : "";
  if (status === 200 && at && rt && uid) {
    return data as LoginResponse;
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
    const { status, data: raw } = await authApiClient.post<unknown>(
      `${AUTH_V1}/logout`,
      { refresh_token: rt },
      { validateStatus: () => true }
    );
    const data = normalizeV1ResponseBody(raw);
    if (
      status >= 200 &&
      status < 300 &&
      data &&
      typeof data === "object" &&
      (data as { success?: boolean }).success === true
    ) {
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
    /** 后端若返回展示名 / 头像 / 注册时间，桌面端写入账户快照（均为可选） */
    displayName?: string;
    avatarUrl?: string;
    createdAt?: string;
  };
};

function pickOptionalMeString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

/** 在已通过 isAuthMeSuccessBody 校验后，从原始 user 对象补齐可选字段（兼容 snake_case） */
function enrichAuthMeUser(rawUser: Record<string, unknown>, base: AuthMeSuccessBody["user"]): AuthMeSuccessBody["user"] {
  return {
    ...base,
    market: pickOptionalMeString(rawUser.market, base.market),
    locale: pickOptionalMeString(rawUser.locale, base.locale),
    product: pickOptionalMeString(rawUser.product, base.product),
    client_platform: pickOptionalMeString(
      rawUser.client_platform,
      rawUser.clientPlatform,
      base.client_platform
    ),
    displayName: pickOptionalMeString(rawUser.displayName, rawUser.display_name, rawUser.name),
    avatarUrl: pickOptionalMeString(rawUser.avatarUrl, rawUser.avatar_url, rawUser.avatar),
    createdAt: pickOptionalMeString(rawUser.createdAt, rawUser.created_at)
  };
}

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
 * MODULE C-3：解析 `GET /v1/account/session`（身份 profile）；无效会话时 `clearVault === true`（网络/5xx 不清 vault）。
 */
export async function fetchAuthMeValidated(): Promise<AuthMeSuccessBody> {
  const { apiClient } = await import("./apiClient");
  const runOnce = async (afterRefreshRetry: boolean): Promise<AuthMeSuccessBody> => {
    let status = 0;
    let raw: unknown;
    try {
      const res = await apiClient.get<unknown>("/v1/account/session", { validateStatus: () => true });
      status = res.status;
      raw = res.data;
    } catch (e) {
      if (isAxiosError(e) && e.response == null) {
        throw new AuthMeFailure("网络异常，请稍后重试。", false);
      }
      throw e;
    }

    const data = normalizeV1ResponseBody(raw);

    if (status === 200 && data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const userId = String(d.userId ?? "").trim();
      let email = String(d.email ?? "").trim();
      if (!email) {
        const { useAuthStore } = await import("../store/authStore");
        email = useAuthStore.getState().userEmail.trim();
      }
      if (userId && email) {
        const rawUser = {
          ...d,
          userId,
          email,
          client_platform: d.platform ?? d.client_platform
        };
        return {
          success: true,
          user: enrichAuthMeUser(rawUser as Record<string, unknown>, { userId, email })
        };
      }
    }

    const rawCode =
      raw && typeof raw === "object" && "code" in raw
        ? String((raw as { code: unknown }).code).trim()
        : "";
    if (status === 403 && rawCode === "EMAIL_NOT_VERIFIED") {
      throw new AuthMeFailure("请先完成邮箱验证。", true);
    }

    if (status === 401 && !afterRefreshRetry) {
      const { tryRefreshSession } = await import("./authSilentRefresh");
      const ok = await tryRefreshSession();
      if (ok) return runOnce(true);
    }

    let message = "登录已失效";
    if (raw && typeof raw === "object" && (raw as { success?: unknown }).success === false) {
      const m = readLoginFailureMessage(raw);
      if (m) message = m;
    }
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
  user: {
    user_id: string;
    email: string;
    market: string;
    locale: string;
    product?: string;
    client_platform?: string;
    displayName?: string;
    avatarUrl?: string;
    createdAt?: string;
  };
}> {
  const r = await fetchAuthMeValidated();
  return {
    user: {
      user_id: r.user.userId,
      email: r.user.email,
      market: r.user.market ?? "cn",
      locale: r.user.locale ?? "zh-CN",
      ...(r.user.product != null ? { product: r.user.product } : {}),
      ...(r.user.client_platform != null ? { client_platform: r.user.client_platform } : {}),
      ...(r.user.displayName != null ? { displayName: r.user.displayName } : {}),
      ...(r.user.avatarUrl != null ? { avatarUrl: r.user.avatarUrl } : {}),
      ...(r.user.createdAt != null ? { createdAt: r.user.createdAt } : {})
    }
  };
}
