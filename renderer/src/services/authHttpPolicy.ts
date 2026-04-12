/**
 * MODULE C-6：Shared Core `apiClient` 响应分流策略（与登录页、hydrate 职责边界分离）。
 */

/** 这些路径的 401 不代表「当前会话在业务侧仍有效」，由调用方处理（登录失败、登出尽力而为）。 */
export const AUTH_FLOW_PATHS_401_EXEMPT = [
  "/auth/login",
  "/auth/logout",
  "/auth/refresh",
  "/v1/auth/login",
  "/v1/auth/logout",
  "/v1/auth/refresh"
];

/**
 * `/auth/me` 使用 validateStatus 全吞时走 fetchAuthMeValidated，不触发 axios 错误链；此处可放行显式 GET 401。
 * 双拦截：Account 等直调若 401 仍会 hit 全局拦截器 — 与「me 401 回登录」一致。
 */
export function isAuth401ResponseExempt(requestUrl: string | undefined): boolean {
  if (!requestUrl) return false;
  const path = requestUrl.split("?")[0].replace(/\/+$/, "") || "";
  return AUTH_FLOW_PATHS_401_EXEMPT.some((ex) => path === ex || path.endsWith(ex));
}
