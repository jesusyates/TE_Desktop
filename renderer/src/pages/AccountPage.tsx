import { useEffect, useLayoutEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useUiStrings } from "../i18n/useUiStrings";
import { formatPrefLocale, formatPrefMarket, getUiLangMode } from "../i18n/preferenceLabels";
import { useAuthStore } from "../store/authStore";
import { performLogoutAndQuitApp } from "../services/authLogoutFlow";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

type MeUser = {
  user_id: string;
  email: string;
  market: string;
  locale: string;
  product?: string;
  client_platform?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt?: string;
};

function formatCreatedAt(raw: string | undefined, localeHint: string): string {
  if (!raw?.trim()) return "";
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw.trim();
  try {
    return new Date(t).toLocaleDateString(localeHint || undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return raw.trim();
  }
}

export const AccountPage = () => {
  const u = useUiStrings();
  const location = useLocation();
  const authLocale = useAuthStore((s) => s.locale);
  const accountUiMode = getUiLangMode(authLocale);
  const hydrated = useAuthStore((s) => s.hydrated);
  const userId = useAuthStore((s) => s.userId);
  const userEmail = useAuthStore((s) => s.userEmail);
  const market = useAuthStore((s) => s.market);
  const locale = useAuthStore((s) => s.locale);
  const accountProfileSnapshot = useAuthStore((s) => s.accountProfileSnapshot);
  const accountEntitlement = useAuthStore((s) => s.accountEntitlement);
  const accountProfileRefreshing = useAuthStore((s) => s.accountProfileRefreshing);
  const accountEntitlementRevalidating = useAuthStore((s) => s.accountEntitlementRevalidating);
  const refreshAccountProfile = useAuthStore((s) => s.refreshAccountProfile);
  const revalidateAccountEntitlement = useAuthStore((s) => s.revalidateAccountEntitlement);

  const me = useMemo((): MeUser | null => {
    if (!hydrated) return null;
    const snap = accountProfileSnapshot;
    if (snap && snap.userId === userId) {
      return {
        user_id: snap.userId,
        email: snap.email,
        market: snap.market,
        locale: snap.locale,
        ...(snap.product != null ? { product: snap.product } : {}),
        ...(snap.client_platform != null ? { client_platform: snap.client_platform } : {}),
        ...(snap.displayName != null ? { displayName: snap.displayName } : {}),
        ...(snap.avatarUrl != null ? { avatarUrl: snap.avatarUrl } : {}),
        ...(snap.createdAt != null ? { createdAt: snap.createdAt } : {})
      };
    }
    if (userId.trim() && userEmail.trim()) {
      return {
        user_id: userId.trim(),
        email: userEmail.trim(),
        market,
        locale
      };
    }
    return null;
  }, [hydrated, accountProfileSnapshot, userId, userEmail, market, locale]);

  /** 仅刷新配额/套餐（新鲜度由 store 控制）；不因进入页面拉 /me */
  useEffect(() => {
    void revalidateAccountEntitlement({ force: false });
  }, [revalidateAccountEntitlement]);

  /** 本地尚无身份快照时静默补全一次（不展示身份区「同步中」） */
  useEffect(() => {
    if (!hydrated || !userId.trim()) return;
    if (accountProfileSnapshot != null) return;
    void refreshAccountProfile({ silent: true });
  }, [hydrated, userId, accountProfileSnapshot, refreshAccountProfile]);

  useLayoutEffect(() => {
    const id = location.hash.replace(/^#/, "").trim();
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, location.pathname]);

  const createdLabel = formatCreatedAt(me?.createdAt, authLocale);

  return (
    <div className="page-stack account-hub">
      <header className="page-header">
        <h1 className="page-title">{u.console.accountTitle}</h1>
        <p className="page-lead text-muted">{u.settings.accountLead}</p>
      </header>

      <section className="settings-section" id="account-identity" aria-labelledby="acc-h-identity">
        <h2 id="acc-h-identity" className="settings-section__title">
          {u.settings.accountSectionIdentity}
        </h2>
        <Card title={u.settings.userCard}>
          <div className="account-identity-toolbar">
            <Button
              variant="secondary"
              type="button"
              disabled={accountProfileRefreshing}
              aria-busy={accountProfileRefreshing}
              onClick={() => void refreshAccountProfile({ silent: false })}
            >
              {accountProfileRefreshing ? u.settings.accountSyncing : u.settings.accountRefresh}
            </Button>
          </div>
          {me ? (
            <div className="detail-list">
              {me.avatarUrl ? (
                <div className="detail-row account-identity-avatar-row">
                  <span className="detail-row__label">{u.settings.labels.avatarUrl}</span>
                  <span className="detail-row__value">
                    <img
                      src={me.avatarUrl}
                      alt=""
                      className="account-identity-avatar"
                      referrerPolicy="no-referrer"
                    />
                  </span>
                </div>
              ) : null}
              {me.displayName ? (
                <div className="detail-row">
                  <span className="detail-row__label">{u.settings.labels.displayName}</span>
                  <span className="detail-row__value">{me.displayName}</span>
                </div>
              ) : null}
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.userId}</span>
                <span className="detail-row__value">{me.user_id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.email}</span>
                <span className="detail-row__value">{me.email}</span>
              </div>
              {createdLabel ? (
                <div className="detail-row">
                  <span className="detail-row__label">{u.settings.labels.createdAt}</span>
                  <span className="detail-row__value">{createdLabel}</span>
                </div>
              ) : null}
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.marketMe}</span>
                <span className="detail-row__value">{formatPrefMarket(me.market, accountUiMode)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.localeMe}</span>
                <span className="detail-row__value">{formatPrefLocale(me.locale, accountUiMode)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.product}</span>
                <span className="detail-row__value">
                  {me.product === "aics" || me.product == null ? u.common.productAics : me.product}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.clientPlatform}</span>
                <span className="detail-row__value">
                  {me.client_platform === "desktop" || me.client_platform == null
                    ? u.common.platformDesktop
                    : me.client_platform}
                </span>
              </div>
            </div>
          ) : (
            <p className="auto-placeholder">{u.settings.meErr}</p>
          )}
        </Card>
      </section>

      <section className="settings-section" id="account-subscription" aria-labelledby="acc-h-sub">
        <h2 id="acc-h-sub" className="settings-section__title">
          {u.settings.accountSectionSubscription}
        </h2>
        <Card>
          <p className="text-muted mb-0">{u.settings.accountSectionSubscriptionPlaceholder}</p>
        </Card>
      </section>

      <section className="settings-section" id="account-quota" aria-labelledby="acc-h-quota">
        <h2 id="acc-h-quota" className="settings-section__title">
          {u.settings.accountSectionQuota}
        </h2>
        <p className="settings-section__lead text-muted mb-2">{u.settings.billingFoot}</p>
        <Card title={u.settings.billingCard}>
          {accountEntitlementRevalidating && !accountEntitlement ? (
            <p className="text-muted text-sm mb-0">{u.settings.loading}</p>
          ) : null}
          {accountEntitlement ? (
            <div className="detail-list">
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.plan}</span>
                <span className="detail-row__value">{accountEntitlement.plan}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.quota}</span>
                <span className="detail-row__value">{accountEntitlement.quota}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.used}</span>
                <span className="detail-row__value">{accountEntitlement.used}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.status}</span>
                <span className="detail-row__value">{accountEntitlement.status}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.product}</span>
                <span className="detail-row__value">
                  {accountEntitlement.product === "aics" ? u.common.productAics : accountEntitlement.product}
                </span>
              </div>
            </div>
          ) : accountEntitlementRevalidating ? null : (
            <p className="auto-placeholder">{u.settings.entErr}</p>
          )}
          <p className="text-muted text-sm mt-3 mb-0">{u.console.usageRechargeSoon}</p>
        </Card>
      </section>

      <section className="settings-section" id="account-billing" aria-labelledby="acc-h-bill">
        <h2 id="acc-h-bill" className="settings-section__title">
          {u.settings.accountSectionBilling}
        </h2>
        <Card>
          <p className="text-muted mb-0">{u.settings.accountSectionBillingPlaceholder}</p>
        </Card>
      </section>

      <section className="settings-section" id="account-security" aria-labelledby="acc-h-sec">
        <h2 id="acc-h-sec" className="settings-section__title">
          {u.settings.accountSectionSecurity}
        </h2>
        <Card>
          <p className="text-muted mb-3">{u.settings.accountSectionSecurityLead}</p>
          <Button
            variant="secondary"
            onClick={() => {
              if (!window.confirm(u.sessionUx.logoutConfirm)) return;
              void performLogoutAndQuitApp();
            }}
          >
            {u.settings.logout}
          </Button>
        </Card>
      </section>
    </div>
  );
};
