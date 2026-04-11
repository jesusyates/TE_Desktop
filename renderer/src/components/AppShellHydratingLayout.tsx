import { useUiStrings } from "../i18n/useUiStrings";

/**
 * 冷启动 / 会话恢复阶段：与 AppShell 同构的 chrome，避免全屏「孤立卡片」式白屏感。
 * 不挂载业务 Outlet、不发起网络请求。
 */
export function AppShellHydratingLayout() {
  const u = useUiStrings();
  const navItems = [
    { label: u.nav.workbench },
    { label: u.nav.toolHub },
    { label: u.nav.toolsUtilities },
    { label: u.nav.templates },
    { label: u.nav.automation },
    { label: u.nav.history },
    { label: u.nav.savedResults },
    { label: u.nav.account },
    { label: u.nav.settings }
  ];

  return (
    <div className="shell-root app-root">
      <aside className="shell-sidebar sidebar" aria-hidden="true">
        <header className="sidebar-header shell-brand">
          <p className="shell-brand__name">{u.shell.brand}</p>
        </header>
        <hr className="sidebar-divider" aria-hidden="true" />
        <nav>
          {navItems.map((item) => (
            <span key={item.label} className="sidebar-item app-shell-hydrate-nav__fake">
              {item.label}
            </span>
          ))}
        </nav>
      </aside>
      <section className="shell-main shell-content-area">
        <header className="app-topbar" role="banner" aria-label={u.shell.brand}>
          <div className="app-topbar__session" aria-live="polite">
            <span className="auth-session-badge auth-session-badge--hydrating">{u.sessionUx.badgeHydrating}</span>
          </div>
          <div className="window-controls" aria-hidden="true" />
        </header>
        <main className="app-content">
          <div className="app-content-inner app-shell-hydrate-main">
            <div className="app-shell-hydrate-panel" role="status" aria-busy="true">
              <p className="app-shell-hydrate-panel__title">{u.sessionUx.hydratingTitle}</p>
              <p className="app-shell-hydrate-panel__lead text-muted">{u.sessionUx.hydratingLead}</p>
              <p className="app-shell-hydrate-panel__status text-muted text-sm">{u.common.authHydrating}</p>
            </div>
          </div>
        </main>
      </section>
    </div>
  );
}
