import { useEffect, useMemo, useRef } from "react";
import { getSystemPolicy } from "../services/systemPolicyService";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useUiStrings } from "../i18n/useUiStrings";
import { useAuthStore } from "../store/authStore";
import { isValidRestoreRoute, loadHotSnapshot, schedulePersistHotState } from "../services/stateRestoration";
import { ContextDebugBanner } from "./ContextDebugBanner";

export const AppShell = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const u = useUiStrings();
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);
  const workbench = location.pathname === "/workbench";
  const routeRestoredRef = useRef(false);

  const hasToken = Boolean(accessToken?.trim());
  const hasUser = Boolean(userId?.trim());

  const { sessionModifier, sessionLabel } = useMemo(() => {
    if (!hydrated) {
      return {
        sessionModifier: " auth-session-badge--hydrating",
        sessionLabel: u.sessionUx.badgeHydrating
      };
    }
    if (hasUser) {
      return {
        sessionModifier: " auth-session-badge--session",
        sessionLabel: u.sessionUx.badgeSession
      };
    }
    if (hasToken) {
      return {
        sessionModifier: " auth-session-badge--guest",
        sessionLabel: u.sessionUx.badgeIncomplete
      };
    }
    return {
      sessionModifier: " auth-session-badge--guest",
      sessionLabel: u.sessionUx.badgeGuest
    };
  }, [hydrated, hasUser, hasToken, u.sessionUx]);

  useEffect(() => {
    schedulePersistHotState({ lastRoute: location.pathname }, 200);
  }, [location.pathname]);

  useEffect(() => {
    void getSystemPolicy();
  }, []);

  useEffect(() => {
    if (routeRestoredRef.current) return;
    routeRestoredRef.current = true;
    const hot = loadHotSnapshot();
    const target = hot?.lastRoute?.trim() ?? "";
    if (target && isValidRestoreRoute(target) && target !== location.pathname) {
      navigate(target, { replace: true });
    }
  }, [navigate, location.pathname]);

  const navItems = [
    { to: "/workbench", label: u.nav.workbench },
    { to: "/tool-hub", label: u.nav.toolHub },
    { to: "/tools", label: u.nav.toolsUtilities },
    { to: "/templates", label: u.nav.templates },
    { to: "/automation", label: u.nav.automation },
    { to: "/history", label: u.nav.history },
    { to: "/saved-results", label: u.nav.savedResults },
    { to: "/account", label: u.nav.account },
    { to: "/settings", label: u.nav.settings }
  ];

  return (
    <div className="shell-root app-root">
      <aside className="shell-sidebar sidebar">
        <header className="sidebar-header shell-brand">
          <p className="shell-brand__name">{u.shell.brand}</p>
        </header>
        <hr className="sidebar-divider" aria-hidden="true" />
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="shell-main shell-content-area">
        <header className="app-topbar" role="banner" aria-label={u.shell.brand}>
          <div className="app-topbar__session" aria-live="polite">
            {hydrated && hasUser ? (
              <Link to="/account" className="app-topbar__session-link" title={u.nav.account}>
                <span className={`auth-session-badge${sessionModifier}`}>{sessionLabel}</span>
                <span className="auth-session-badge__id text-muted text-sm" title={userId}>
                  {userId.length > 14 ? `${userId.slice(0, 12)}…` : userId}
                </span>
              </Link>
            ) : (
              <>
                <span className={`auth-session-badge${sessionModifier}`}>{sessionLabel}</span>
                {hasToken ? (
                  <span className="auth-session-badge__id text-muted text-sm">{u.sessionUx.badgeIncomplete}</span>
                ) : null}
              </>
            )}
          </div>
          <div className="window-controls" aria-hidden="true" />
        </header>
        <main className="app-content">
          <div
            className={`app-content-inner${workbench ? " app-content-inner--workbench" : ""}`}
          >
            {!workbench ? <ContextDebugBanner /> : null}
            <Outlet />
          </div>
        </main>
      </section>
    </div>
  );
};
