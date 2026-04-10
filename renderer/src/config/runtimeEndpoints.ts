/**
 * D-7-5A：双后端 HTTP 基址单点配置（无密钥）。
 *
 * - **SHARED_CORE_BASE_URL**：账户 / 偏好 / `apiClient` / `authApi`（shared-core-backend，默认端口 4000）。
 * - **AI_GATEWAY_BASE_URL**：analyze / plan / 等（`aiGatewayClient`，典型端口 3000）。
 *
 * Shared Core 优先级：
 * 1. `VITE_SHARED_CORE_BASE_URL` / `AICS_SHARED_CORE_BASE_URL`（显式 URL）
 * 2. `VITE_AICS_BACKEND_PROFILE` = `local` | `development` | `dev` → `http://127.0.0.1:4000`
 * 3. 其它 → `http://43.160.229.50:4000`（当前默认：接线上 shared-core-backend）
 */

function normalizeBaseUrl(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = String(raw).trim().replace(/\/+$/, "");
  return t.length > 0 ? t : undefined;
}

const CORE_LOCAL = "http://127.0.0.1:4000";
const CORE_REMOTE = "http://43.160.229.50:4000";
const DEFAULT_AI_GATEWAY_BASE_URL = "http://43.160.229.50:3000";

function resolveSharedCoreBaseUrl(): string {
  const explicit = normalizeBaseUrl(import.meta.env.VITE_SHARED_CORE_BASE_URL);
  if (explicit) return explicit;
  const profile = String(import.meta.env.VITE_AICS_BACKEND_PROFILE ?? "remote")
    .trim()
    .toLowerCase();
  if (profile === "local" || profile === "development" || profile === "dev") return CORE_LOCAL;
  return CORE_REMOTE;
}

export const SHARED_CORE_BASE_URL = resolveSharedCoreBaseUrl();

export const AI_GATEWAY_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_AI_GATEWAY_BASE_URL) ?? DEFAULT_AI_GATEWAY_BASE_URL;

/**
 * Auth：邮箱重发验证码。默认开启（Shared Core 已接 POST /v1/auth/resend-verification）。
 * 若某环境未部署该接口，可设 `VITE_AUTH_VERIFICATION_RESEND_ENABLED=0` 禁用按钮。
 */
export const AUTH_VERIFICATION_RESEND_ENABLED =
  String(import.meta.env.VITE_AUTH_VERIFICATION_RESEND_ENABLED ?? "").trim() !== "0";

/** 与 shared-core-backend/auth/auth.resend-cooldown.js COOLDOWN_MS 一致（秒）。 */
export const AUTH_RESEND_COOLDOWN_SECONDS = 120;
