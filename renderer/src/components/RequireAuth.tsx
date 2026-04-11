import { PropsWithChildren, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { AppShellHydratingLayout } from "./AppShellHydratingLayout";

/**
 * MODULE C-6 边界：页面级未登录拦截（hydrated 且无缺省 userId/token 时回登录）。
 * 身份失效（401）由 apiClient 拦截器 + invalidateAuthenticatedSessionAndGoLogin 处理，不在此重复清 vault。
 *
 * 未登录时禁止返回 `null`（仅Outlet 消逝易导致瞬态焦点/层叠异常）；改用声明式 `<Navigate />`。
 * 主动登出经 `performLogoutAndQuitApp`：清会话与本地缓存后退出应用（冷启动再登录）。
 */
export function RequireAuth({ children }: PropsWithChildren) {
  const location = useLocation();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);

  useEffect(() => {
    void useAuthStore.getState().hydrate();
  }, []);

  if (!hydrated) {
    return <AppShellHydratingLayout />;
  }

  if (!accessToken.trim() || !userId.trim()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
