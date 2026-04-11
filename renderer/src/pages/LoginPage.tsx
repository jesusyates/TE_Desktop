import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { loginWithEmailPassword } from "../services/authService";
import { buildAuthFlowErrorStrings, formatLoginErrorMessage, hasAuthCode } from "../services/loginErrorMessage";
import {
  runAuthPublicRouteInteractionCleanup,
  runAuthPublicRouteMountFocusReset
} from "../services/authInteractionCleanup";
import { isValidEmailFormat, normalizeEmailInput } from "../modules/auth/authValidation";
import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { buildVerifyEmailUrl } from "../services/authVerificationFlow";
import { getLastLoginEmail, setLastLoginEmail } from "../services/lastLoginEmail";
import { listLoginEmailHistory, recordLoginEmailSuccess } from "../services/loginEmailHistory";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { LoginEmailInputWithSuggest } from "../components/auth/LoginEmailInputWithSuggest";
import { useUiStrings } from "../i18n/useUiStrings";
import { ContextDebugBanner } from "../components/ContextDebugBanner";
import { AuthOauthPlaceholder } from "../components/auth/AuthOauthPlaceholder";
import { AuthPublicShellHeader } from "../components/auth/AuthPublicShellHeader";

export const LoginPage = () => {
  const u = useUiStrings();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [email, setEmail] = useState(() => listLoginEmailHistory()[0]?.email?.trim() || getLastLoginEmail());
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const needLoginRedirect = searchParams.get("needLogin") === "1";
  const passwordJustReset = searchParams.get("passwordReset") === "1";

  const resetLoginFormInteractiveDefaults = useCallback(() => {
    setBusy(false);
    setErr("");
    setPasswordVisible(false);
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useLayoutEffect(() => {
    resetLoginFormInteractiveDefaults();
    runAuthPublicRouteInteractionCleanup(`login-layout:${location.pathname}`, location.pathname, {
      focusFirstInputId: "lg-email"
    });
  }, [location.pathname, resetLoginFormInteractiveDefaults]);

  useEffect(() => {
    if (accessToken.trim() && userId.trim()) navigate("/workbench", { replace: true });
  }, [accessToken, userId, navigate]);

  useEffect(() => {
    if (!needLoginRedirect) return;
    runAuthPublicRouteMountFocusReset("lg-email");
  }, [needLoginRedirect]);

  const runLogin = () => {
    if (busy) return;
    setErr("");
    const em = normalizeEmailInput(email);
    if (!em) {
      setErr(u.login.emailRequired);
      return;
    }
    if (!isValidEmailFormat(em)) {
      setErr(u.login.errorInvalidEmailFormat);
      return;
    }
    setBusy(true);
    void loginWithEmailPassword(em, password)
      .then(() => {
        recordLoginEmailSuccess(em);
        setLastLoginEmail(em);
        setBusy(false);
        navigate("/workbench", { replace: true });
      })
      .catch((e: unknown) => {
        if (import.meta.env.DEV) {
          console.error("[login] failed", { baseURL: SHARED_CORE_BASE_URL, path: "/v1/auth/login", email: em, err: e });
        }
        if (hasAuthCode(e, "EMAIL_NOT_VERIFIED")) {
          setLastLoginEmail(em);
          navigate(buildVerifyEmailUrl(em, { fromLogin: true }));
          return;
        }
        setErr(formatLoginErrorMessage(e, buildAuthFlowErrorStrings(u)));
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="shell-root app-root login-shell">
      <section className="shell-main login-shell__main">
        <AuthPublicShellHeader title={u.login.headerTitle} meta={u.login.headerMeta} />
        <main className="workspace-container workspace-container--login">
          <div className="login-panel">
            <div className="page-stack page-narrow">
              <ContextDebugBanner />
              <header className="page-header">
                <h1 className="page-title">{u.login.pageTitle}</h1>
                <p className="page-lead">{u.login.pageLead}</p>
              </header>
              {needLoginRedirect ? (
                <p className="text-muted text-sm mb-2">{u.sessionUx.redirectedFromAuthGate}</p>
              ) : null}
              {passwordJustReset ? (
                <div className="login-email-verify-callout mb-2" role="status">
                  <p className="login-email-verify-callout__lead mb-0">{u.login.passwordResetSuccess}</p>
                </div>
              ) : null}
              <Card title={u.login.cardTitle}>
                <form
                  className="login-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    runLogin();
                  }}
                >
                  <div className="form-field">
                    <label className="form-label" htmlFor="lg-email">
                      {u.login.email}
                    </label>
                    <LoginEmailInputWithSuggest
                      id="lg-email"
                      value={email}
                      onChange={setEmail}
                      placeholder={u.login.phEmail}
                      labels={{
                        recentBadge: u.login.emailSuggestRecent,
                        recommendedBadge: u.login.emailSuggestRecommended,
                        clearHistory: u.login.emailSuggestClearHistory,
                        removeFromHistoryAria: u.login.emailSuggestRemoveAria
                      }}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="lg-password">
                      {u.login.password}
                    </label>
                    <div className="login-password-wrap">
                      <Input
                        id="lg-password"
                        type={passwordVisible ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={u.login.phPassword}
                      />
                      <button
                        type="button"
                        className="login-password-toggle"
                        aria-pressed={passwordVisible}
                        aria-label={u.login.passwordToggleHint}
                        onClick={() => setPasswordVisible((v) => !v)}
                      >
                        {passwordVisible ? u.login.hidePassword : u.login.showPassword}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? u.login.submitting : u.login.submit}
                  </Button>
                </form>
                {err ? (
                  <pre
                    className="text-danger text-sm mt-2 mb-0 whitespace-pre-wrap break-words font-sans"
                    role="alert"
                  >
                    {err}
                  </pre>
                ) : null}
                <div className="auth-auth-links">
                  <span className="text-muted">{u.login.noAccount}</span>{" "}
                  <Link to="/register">{u.login.linkRegister}</Link>
                  <span className="text-muted mx-1">·</span>
                  <Link to="/forgot-password">{u.login.forgotPassword}</Link>
                </div>
                <AuthOauthPlaceholder u={u} />
              </Card>
            </div>
          </div>
        </main>
      </section>
    </div>
  );
};
