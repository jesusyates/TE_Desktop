import { useEffect, useLayoutEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUiStrings } from "../i18n/useUiStrings";
import { formatPrefLocale, formatPrefMarket, getUiLangMode } from "../i18n/preferenceLabels";
import { useAuthStore } from "../store/authStore";
import { apiClient } from "../services/apiClient";
import { normalizeV1ResponseBody } from "../services/v1Envelope";
import { performLogoutToLogin } from "../services/authLogoutFlow";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

type MeUser = {
  user_id: string;
  email: string;
  market: string;
  locale: string;
  product?: string;
  client_platform?: string;
};

type BillingEntitlement = {
  user_id: string;
  product: string;
  plan: string;
  quota: number;
  used: number;
  status: string;
};

export const AccountPage = () => {
  const u = useUiStrings();
  const navigate = useNavigate();
  const location = useLocation();
  const authLocale = useAuthStore((s) => s.locale);
  const accountUiMode = getUiLangMode(authLocale);
  const [me, setMe] = useState<MeUser | null>(null);
  const [meError, setMeError] = useState("");
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [entitlementError, setEntitlementError] = useState("");

  useEffect(() => {
    apiClient
      .get<unknown>("/v1/auth/me", { validateStatus: () => true })
      .then((r) => {
        const inner = normalizeV1ResponseBody(r.data) as Record<string, unknown> | null;
        if (
          r.status === 200 &&
          inner &&
          typeof inner === "object" &&
          inner.success === true &&
          inner.user &&
          typeof inner.user === "object"
        ) {
          const uu = inner.user as {
            userId: string;
            email: string;
            market: string;
            locale: string;
            product?: string;
            client_platform?: string;
          };
          setMe({
            user_id: uu.userId,
            email: uu.email,
            market: uu.market,
            locale: uu.locale,
            ...(uu.product != null ? { product: uu.product } : {}),
            ...(uu.client_platform != null ? { client_platform: uu.client_platform } : {})
          });
        } else setMeError(u.settings.meErr);
      })
      .catch(() => setMeError(u.settings.meErr));
  }, [u.settings.meErr]);

  useEffect(() => {
    apiClient
      .get<BillingEntitlement>("/billing/entitlement")
      .then((r) => setEntitlement(r.data))
      .catch(() => setEntitlementError(u.settings.entErr));
  }, [u.settings.entErr]);

  useLayoutEffect(() => {
    const id = location.hash.replace(/^#/, "").trim();
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, location.pathname]);

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
          {me ? (
            <div className="detail-list">
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.userId}</span>
                <span className="detail-row__value">{me.user_id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.email}</span>
                <span className="detail-row__value">{me.email}</span>
              </div>
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
            <p className="auto-placeholder">{meError || u.settings.loading}</p>
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
          {entitlement ? (
            <div className="detail-list">
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.plan}</span>
                <span className="detail-row__value">{entitlement.plan}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.quota}</span>
                <span className="detail-row__value">{entitlement.quota}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.used}</span>
                <span className="detail-row__value">{entitlement.used}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.status}</span>
                <span className="detail-row__value">{entitlement.status}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">{u.settings.labels.product}</span>
                <span className="detail-row__value">
                  {entitlement.product === "aics" ? u.common.productAics : entitlement.product}
                </span>
              </div>
            </div>
          ) : (
            <p className="auto-placeholder">{entitlementError || u.settings.loading}</p>
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
              void performLogoutToLogin(navigate);
            }}
          >
            {u.settings.logout}
          </Button>
        </Card>
      </section>
    </div>
  );
};
