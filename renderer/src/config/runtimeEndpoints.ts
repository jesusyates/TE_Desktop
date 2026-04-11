/**
 * D-7-5A：双后端 HTTP 基址单点配置（无密钥）。
 *
 * - **API_BASE_URL** / **SHARED_CORE_BASE_URL**：账户 / 偏好 / `apiClient` / `authApi`（与 shared-core-backend 同源）。
 * - **AI_GATEWAY_BASE_URL**：analyze / plan 等（`aiGatewayClient`）。
 *
 * Shared Core / API 解析优先级：
 * 1. `VITE_API_BASE_URL`（推荐，见 `renderer/.env*`）
 * 2. `VITE_SHARED_CORE_BASE_URL` / `AICS_SHARED_CORE_BASE_URL`（兼容旧名与 Vite define 注入）
 * 3. 兜底：`DEFAULT_LOCAL_API`（本地联调）
 *
 * 不在此文件写死生产环境服务器地址；生产基址由 `renderer/.env.production` 或构建时环境变量提供。
 */

function normalizeBaseUrl(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = String(raw).trim().replace(/\/+$/, "");
  return t.length > 0 ? t : undefined;
}

/** 未配置任何 env 时的本地兜底（开发联调） */
const DEFAULT_LOCAL_API = "http://127.0.0.1:4000";

const DEFAULT_AI_GATEWAY_LOCAL = "http://127.0.0.1:3000";

/** 未单独配置 AI 网关时：与 API 同主机、端口 3000（避免在代码中写死生产域名） */
function defaultAiGatewayFromApi(apiBase: string): string {
  try {
    const u = new URL(apiBase);
    u.port = "3000";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_AI_GATEWAY_LOCAL;
  }
}

export type ApiBaseResolutionSource =
  | "VITE_API_BASE_URL"
  | "VITE_SHARED_CORE_BASE_URL"
  | "defaultLocalApi";

function resolveApiBaseUrlDetailed(): { url: string; source: ApiBaseResolutionSource } {
  const fromPrimary = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
  if (fromPrimary) {
    return { url: fromPrimary, source: "VITE_API_BASE_URL" };
  }
  const legacy = normalizeBaseUrl(import.meta.env.VITE_SHARED_CORE_BASE_URL);
  if (legacy) {
    return { url: legacy, source: "VITE_SHARED_CORE_BASE_URL" };
  }
  return { url: DEFAULT_LOCAL_API, source: "defaultLocalApi" };
}

const _apiResolved = resolveApiBaseUrlDetailed();

/** 主 API（Shared Core）基址；构建/运行环境由 `VITE_API_BASE_URL` 控制 */
export const API_BASE_URL = _apiResolved.url;

/** 与 `API_BASE_URL` 相同（历史命名，供 authApi / apiClient 等沿用） */
export const SHARED_CORE_BASE_URL = API_BASE_URL;

export const AI_GATEWAY_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_AI_GATEWAY_BASE_URL) ??
  (import.meta.env.DEV ? DEFAULT_AI_GATEWAY_LOCAL : defaultAiGatewayFromApi(API_BASE_URL));

/**
 * 登录/注册排障：当前 renderer 解析结果与 env 来源。
 */
export function getSharedCoreBaseUrlDebugInfo(): Record<string, unknown> {
  return {
    mode: import.meta.env.MODE,
    API_BASE_URL,
    SHARED_CORE_BASE_URL,
    resolutionSource: _apiResolved.source,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "",
    VITE_SHARED_CORE_BASE_URL: import.meta.env.VITE_SHARED_CORE_BASE_URL ?? "",
    VITE_AI_GATEWAY_BASE_URL: import.meta.env.VITE_AI_GATEWAY_BASE_URL ?? "",
    VITE_AICS_BACKEND_PROFILE: import.meta.env.VITE_AICS_BACKEND_PROFILE ?? "",
    viteDev: import.meta.env.DEV,
    viteProd: import.meta.env.PROD
  };
}

/** 启动时打印一次，便于确认本地基线与服务器对齐。 */
export function logAuthRuntimeBaseline(): void {
  // eslint-disable-next-line no-console -- 联调基线要求可见
  console.info("[auth-runtime]", getSharedCoreBaseUrlDebugInfo());
}

/**
 * Auth：邮箱重发验证码。默认开启（Shared Core 已接 POST /v1/auth/resend-verification）。
 * 若某环境未部署该接口，可设 `VITE_AUTH_VERIFICATION_RESEND_ENABLED=0` 禁用按钮。
 */
export const AUTH_VERIFICATION_RESEND_ENABLED =
  String(import.meta.env.VITE_AUTH_VERIFICATION_RESEND_ENABLED ?? "").trim() !== "0";

/** 与 shared-core-backend/auth/auth.resend-cooldown.js COOLDOWN_MS 一致（秒）。 */
export const AUTH_RESEND_COOLDOWN_SECONDS = 120;
