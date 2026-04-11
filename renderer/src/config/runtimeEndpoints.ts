/**
 * D-7-5A：双后端 HTTP 基址单点配置（无密钥）。
 *
 * - **SHARED_CORE_BASE_URL**：账户 / 偏好 / `apiClient` / `authApi`（shared-core-backend，端口 4000）。
 * - **AI_GATEWAY_BASE_URL**：analyze / plan / 等（`aiGatewayClient`）。
 *
 * Shared Core 解析优先级：
 * 1. `VITE_SHARED_CORE_BASE_URL` / `AICS_SHARED_CORE_BASE_URL`（Vite define 注入）
 * 2. `VITE_AICS_BACKEND_PROFILE` = local | development | dev → `http://127.0.0.1:4000`
 * 3. `VITE_AICS_BACKEND_PROFILE` = remote | production → 远程默认基址
 * 4. **Vite 开发模式（`import.meta.env.DEV`）且未设 profile**：固定 **`http://127.0.0.1:4000`**（本地联调基线，不猜远程）
 * 5. 生产构建且未设 profile：远程默认基址
 */

function normalizeBaseUrl(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = String(raw).trim().replace(/\/+$/, "");
  return t.length > 0 ? t : undefined;
}

const CORE_LOCAL = "http://127.0.0.1:4000";
const CORE_REMOTE = "http://43.160.229.50:4000";
const DEFAULT_AI_GATEWAY_BASE_URL = "http://43.160.229.50:3000";

export type SharedCoreResolutionSource =
  | "VITE_SHARED_CORE_BASE_URL"
  | "VITE_AICS_BACKEND_PROFILE:local"
  | "VITE_AICS_BACKEND_PROFILE:remote"
  | "viteDevDefault:127.0.0.1:4000"
  | "viteProdDefault:remote";

function resolveSharedCoreBaseUrlDetailed(): { url: string; source: SharedCoreResolutionSource } {
  const explicit = normalizeBaseUrl(import.meta.env.VITE_SHARED_CORE_BASE_URL);
  if (explicit) {
    return { url: explicit, source: "VITE_SHARED_CORE_BASE_URL" };
  }
  const profile = String(import.meta.env.VITE_AICS_BACKEND_PROFILE ?? "")
    .trim()
    .toLowerCase();
  if (profile === "local" || profile === "development" || profile === "dev") {
    return { url: CORE_LOCAL, source: "VITE_AICS_BACKEND_PROFILE:local" };
  }
  if (profile === "remote" || profile === "production") {
    return { url: CORE_REMOTE, source: "VITE_AICS_BACKEND_PROFILE:remote" };
  }
  if (import.meta.env.DEV) {
    return { url: CORE_LOCAL, source: "viteDevDefault:127.0.0.1:4000" };
  }
  return { url: CORE_REMOTE, source: "viteProdDefault:remote" };
}

const _sharedCoreResolved = resolveSharedCoreBaseUrlDetailed();

export const SHARED_CORE_BASE_URL = _sharedCoreResolved.url;

export const AI_GATEWAY_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_AI_GATEWAY_BASE_URL) ?? DEFAULT_AI_GATEWAY_BASE_URL;

/**
 * 登录/注册排障：当前 renderer 解析结果与 env 来源（构建时 define）。
 */
export function getSharedCoreBaseUrlDebugInfo(): Record<string, unknown> {
  return {
    mode: import.meta.env.MODE,
    SHARED_CORE_BASE_URL,
    resolutionSource: _sharedCoreResolved.source,
    viteDefineSource:
      "Vite define: process.env.VITE_SHARED_CORE_BASE_URL / VITE_AICS_BACKEND_PROFILE / AICS_*（见 renderer/vite.config.ts）",
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
