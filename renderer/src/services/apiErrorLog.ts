import { isAxiosError, type AxiosError } from "axios";

/**
 * MODULE C-6：统一 API 失败日志（网络 / HTTP），供 apiClient 集中调用。
 * 不向控制台打印 token 或完整响应体（避免泄露）。
 */
export function logAxiosFailure(scope: string, error: unknown): void {
  if (!isAxiosError(error)) {
    console.error(`[aics-api:${scope}]`, error);
    return;
  }
  const ax = error as AxiosError;
  const path = `${ax.config?.baseURL ?? ""}${ax.config?.url ?? ""}`;
  const method = (ax.config?.method ?? "GET").toUpperCase();
  if (ax.response == null) {
    console.error(`[aics-api:${scope}] network_unreachable`, { method, path, message: ax.message });
    try {
      window.dispatchEvent(
        new CustomEvent("aics:api-network-error", {
          detail: { scope, method, path, message: ax.message }
        })
      );
    } catch {
      /* non-browser */
    }
    return;
  }
  const st = ax.response.status;
  const code =
    ax.response.data && typeof ax.response.data === "object" && "code" in ax.response.data
      ? String((ax.response.data as { code?: unknown }).code ?? "")
      : "";
  console.error(`[aics-api:${scope}] http_error`, { method, path, status: st, code });
}
