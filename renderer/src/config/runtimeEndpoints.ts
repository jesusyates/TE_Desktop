/**
 * D-7-5A：双后端 HTTP 基址单点配置（无密钥、无环境大系统）。
 *
 * - **SHARED_CORE_BASE_URL**：账户 / 偏好 / billing / `apiClient` / `authApi`（典型端口 4000）。
 * - **AI_GATEWAY_BASE_URL**：analyze / plan / safety / audit / usage 等（`api.ts` fetch，典型端口 3000）。
 *
 * 来源：`import.meta.env.VITE_*`（Vite 在 `vite.config.ts` 中可从进程环境透传）→ 下方开发默认值。
 */

function normalizeBaseUrl(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = String(raw).trim().replace(/\/+$/, "");
  return t.length > 0 ? t : undefined;
}

const DEFAULT_SHARED_CORE_BASE_URL = "http://localhost:4000";
const DEFAULT_AI_GATEWAY_BASE_URL = "http://43.160.229.50:3000";

export const SHARED_CORE_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_SHARED_CORE_BASE_URL) ?? DEFAULT_SHARED_CORE_BASE_URL;

export const AI_GATEWAY_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_AI_GATEWAY_BASE_URL) ?? DEFAULT_AI_GATEWAY_BASE_URL;

/**
 * Auth：邮箱重发验证码。默认开启（Shared Core 已接 POST /auth/resend-verification）。
 * 若某环境未部署该接口，可设 `VITE_AUTH_VERIFICATION_RESEND_ENABLED=0` 禁用按钮。
 */
export const AUTH_VERIFICATION_RESEND_ENABLED =
  String(import.meta.env.VITE_AUTH_VERIFICATION_RESEND_ENABLED ?? "").trim() !== "0";

/** 与 shared-core-backend/auth/auth.resend-cooldown.js COOLDOWN_MS 一致（秒）。 */
export const AUTH_RESEND_COOLDOWN_SECONDS = 120;
