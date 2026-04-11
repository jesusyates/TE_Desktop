/** 未登录可访问的认证流页面（不得被全局 fixed 提示层压在下面，否则 Electron 下易出现命中/合成层异常）。 */
const AUTH_PUBLIC_PATHS = new Set([
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password"
]);

export function isAuthPublicRoutePath(pathname: string): boolean {
  const p = String(pathname || "").trim() || "/";
  return AUTH_PUBLIC_PATHS.has(p);
}
