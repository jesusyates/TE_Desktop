import { PropsWithChildren, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useUiStrings } from "../i18n/useUiStrings";

/**
 * MODULE C-6 边界：页面级未登录拦截（hydrated 且无缺省 userId/token 时回登录）。
 * 身份失效（401）由 apiClient 拦截器 + invalidateAuthenticatedSessionAndGoLogin 处理，不在此重复清 vault。
 */
export function RequireAuth({ children }: PropsWithChildren) {
  const u = useUiStrings();
  const navigate = useNavigate();
  const location = useLocation();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);

  useEffect(() => {
    void useAuthStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken.trim() || !userId.trim()) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [hydrated, accessToken, userId, navigate, location.pathname]);

  if (!hydrated) {
    return (
      <div className="auth-gate">
        <div className="auth-gate__panel">
          <p className="auth-gate__brand">{u.shell.brand}</p>
          <h1 className="auth-gate__title">{u.sessionUx.hydratingTitle}</h1>
          <p className="auth-gate__lead">{u.sessionUx.hydratingLead}</p>
          <p className="auth-gate__status" aria-busy="true">
            {u.common.authHydrating}
          </p>
        </div>
      </div>
    );
  }

  if (!accessToken.trim() || !userId.trim()) return null;
  return <>{children}</>;
}
