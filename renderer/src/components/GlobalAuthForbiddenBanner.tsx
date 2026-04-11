import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { isAuthPublicRoutePath } from "../config/authPublicRoutes";
import { useUiStrings } from "../i18n/useUiStrings";
import { LOGOUT_FINISHED_EVENT } from "../services/authLogoutFlow";

function isLikelyUserFacingMessage(m: string): boolean {
  const t = m.trim();
  if (!t) return false;
  if (/^[\u4e00-\u9fff]/.test(t)) return true;
  if (t.length >= 8 && !/^[a-z][a-z0-9_]*$/i.test(t)) return true;
  return false;
}

/** MODULE C-6：403 / 无清会话的权限类失败 — 全局可读提示，不清 vault。 */
export function GlobalAuthForbiddenBanner() {
  const u = useUiStrings();
  const { pathname } = useLocation();
  const hideOnPublicAuth = isAuthPublicRoutePath(pathname);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (hideOnPublicAuth) setMsg(null);
  }, [hideOnPublicAuth]);

  useEffect(() => {
    const h = (ev: Event) => {
      const d = (ev as CustomEvent<{ message?: string | null }>).detail;
      const raw = d?.message?.trim() ?? "";
      setMsg(isLikelyUserFacingMessage(raw) ? raw : u.auth.forbiddenOperation);
      window.setTimeout(() => setMsg(null), 12_000);
    };
    window.addEventListener("aics:auth-forbidden", h);
    return () => window.removeEventListener("aics:auth-forbidden", h);
  }, [u.auth.forbiddenOperation]);

  useEffect(() => {
    const onLogout = () => {
      setMsg(null);
      if (import.meta.env.DEV) console.log("[overlay]", LOGOUT_FINISHED_EVENT, "global-auth-forbidden-banner cleared");
    };
    window.addEventListener(LOGOUT_FINISHED_EVENT, onLogout as EventListener);
    return () => window.removeEventListener(LOGOUT_FINISHED_EVENT, onLogout as EventListener);
  }, []);

  if (!msg || hideOnPublicAuth) return null;
  return (
    <div className="global-auth-forbidden-banner" role="alert">
      <span className="global-auth-forbidden-banner__text">{msg}</span>
      <button
        type="button"
        className="global-auth-forbidden-banner__close"
        aria-label={u.stage.closed}
        onClick={() => setMsg(null)}
      >
        ×
      </button>
    </div>
  );
}
