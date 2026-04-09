/**
 * D-7-6H：对原始/半原始错误串做轻量归类，用于补充提示行（主文案仍走 toUserFacingExecutionError）。
 */
export function isWorkbenchLikelyNetworkError(raw: string): boolean {
  const lower = raw.trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("network error") ||
    lower.includes("err_network") ||
    lower.includes("network_error") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("failed to fetch")
  );
}

export function isWorkbenchLikelyTimeoutError(raw: string): boolean {
  const lower = raw.trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("timeout") ||
    lower.includes("econnaborted") ||
    lower.includes("ai_router_timeout") ||
    lower.includes("router_timeout")
  );
}
