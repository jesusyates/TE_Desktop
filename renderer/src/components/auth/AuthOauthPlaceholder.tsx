import type { UiCatalog } from "../../i18n/uiCatalog";

/** 第三方登录预留：统一入口，避免登录/注册页各写一套。 */
export function AuthOauthPlaceholder({ u }: { u: UiCatalog }) {
  const o = u.authOAuth;
  return (
    <div className="auth-oauth-block">
      <p className="auth-oauth-title">{o.sectionTitle}</p>
      <div className="auth-oauth-row">
        <button type="button" className="auth-oauth-btn" disabled title={o.comingSoon}>
          {o.google}
        </button>
        <button type="button" className="auth-oauth-btn" disabled title={o.comingSoon}>
          {o.wechat}
        </button>
        <button type="button" className="auth-oauth-btn" disabled title={o.comingSoon}>
          {o.qq}
        </button>
      </div>
    </div>
  );
}
