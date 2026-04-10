import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { loginWithEmailPassword } from "../services/authService";
import { formatLoginErrorWithDiagnostics, hasAuthCode } from "../services/loginErrorMessage";
import { isValidEmailFormat, normalizeEmailInput } from "../modules/auth/authValidation";
import { getSharedCoreBaseUrlDebugInfo, SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { getLastLoginEmail, setLastLoginEmail } from "../services/lastLoginEmail";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useUiStrings } from "../i18n/useUiStrings";
import { ContextDebugBanner } from "../components/ContextDebugBanner";
import { AuthOauthPlaceholder } from "../components/auth/AuthOauthPlaceholder";

export const LoginPage = () => {
  const u = useUiStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [email, setEmail] = useState(getLastLoginEmail);
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [err, setErr] = useState("");
  const [emailNotVerifiedGate, setEmailNotVerifiedGate] = useState(false);
  const [busy, setBusy] = useState(false);
  const needLoginRedirect = searchParams.get("needLogin") === "1";
  const passwordJustReset = searchParams.get("passwordReset") === "1";

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (accessToken.trim() && userId.trim()) navigate("/workbench", { replace: true });
  }, [accessToken, userId, navigate]);

  useEffect(() => {
    // eslint-disable-next-line no-console -- 必须可见实际解析的 Shared Core 基址与构建注入变量
    console.info("[auth-runtime] Shared Core 配置快照", getSharedCoreBaseUrlDebugInfo());
  }, []);

  useEffect(() => {
    if (!needLoginRedirect) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById("lg-email")?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [needLoginRedirect]);

  const runLogin = () => {
    if (busy) return;
    setErr("");
    setEmailNotVerifiedGate(false);
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
        setLastLoginEmail(em);
      })
      .catch((e: unknown) => {
        if (import.meta.env.DEV) {
          console.error("[login] failed", { baseURL: SHARED_CORE_BASE_URL, path: "/v1/auth/login", email: em, err: e });
        }
        if (hasAuthCode(e, "EMAIL_NOT_VERIFIED")) {
          setEmailNotVerifiedGate(true);
          setErr("");
          return;
        }
        setEmailNotVerifiedGate(false);
        setErr(
          formatLoginErrorWithDiagnostics(e, {
            errorGeneric: u.login.error,
            errorInvalidCredentials: u.login.errorInvalidCredentials,
            errorInvalidEmailFormat: u.login.errorInvalidEmailFormat,
            errorNetwork: u.login.errorNetwork,
            errorEmailNotVerified: u.login.errorEmailNotVerified,
            errorTooManyRequests: u.login.errorTooManyRequests,
            errorTooManyAttempts: u.login.errorTooManyAttempts,
            resendCooldownWait: u.login.resendCooldownWait,
            resendCooldownIn: u.login.resendCooldownIn
          })
        );
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="shell-root app-root login-shell">
      <section className="shell-main login-shell__main">
        <header className="shell-header">
          <span className="shell-header__title">{u.login.headerTitle}</span>
          <span className="shell-header__meta">{u.login.headerMeta}</span>
        </header>
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
                    <Input
                      id="lg-email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailNotVerifiedGate(false);
                      }}
                      placeholder={u.login.phEmail}
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
                {emailNotVerifiedGate ? (
                  <div className="login-email-verify-callout" role="status">
                    <p className="login-email-verify-callout__title">{u.login.emailNotVerifiedTitle}</p>
                    <p className="login-email-verify-callout__lead">{u.login.emailNotVerifiedLead}</p>
                    <Button
                      type="button"
                      disabled={busy || !email.trim()}
                      onClick={() => {
                        const em = email.trim();
                        if (!em) return;
                        navigate(`/verify-email?email=${encodeURIComponent(em)}`);
                      }}
                    >
                      {u.login.goVerifyEmail}
                    </Button>
                    {!email.trim() ? (
                      <p className="login-email-verify-callout__hint text-muted text-sm mb-0">
                        {u.login.goVerifyEmailHint}
                      </p>
                    ) : null}
                  </div>
                ) : err ? (
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
