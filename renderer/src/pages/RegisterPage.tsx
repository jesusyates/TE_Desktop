import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { registerAccountOnly } from "../services/authService";
import { isRegisterUnverifiedExistingError } from "../services/authApi";
import { formatLoginErrorMessage } from "../services/loginErrorMessage";
import { isValidEmailFormat, normalizeEmailInput } from "../modules/auth/authValidation";
import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { setLastLoginEmail } from "../services/lastLoginEmail";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useUiStrings } from "../i18n/useUiStrings";
import { ContextDebugBanner } from "../components/ContextDebugBanner";
import { AuthOauthPlaceholder } from "../components/auth/AuthOauthPlaceholder";

const MIN_PASSWORD = 8;

export const RegisterPage = () => {
  const u = useUiStrings();
  const r = u.register;
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);
  const hydrate = useAuthStore((s) => s.hydrate);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[auth] baseURL:", SHARED_CORE_BASE_URL);
    }
  }, []);

  useEffect(() => {
    if (accessToken.trim() && userId.trim()) navigate("/workbench", { replace: true });
  }, [accessToken, userId, navigate]);

  const runRegister = () => {
    if (busy) return;
    setErr("");
    const em = normalizeEmailInput(email);
    if (!em) {
      setErr(r.emailRequired);
      return;
    }
    if (!isValidEmailFormat(em)) {
      setErr(u.login.errorInvalidEmailFormat);
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setErr(r.errorPasswordShort);
      return;
    }
    if (password !== password2) {
      setErr(r.errorPasswordMismatch);
      return;
    }
    setBusy(true);
    void registerAccountOnly(em, password)
      .then(({ email: em }) => {
        setLastLoginEmail(em);
        navigate(`/verify-email?email=${encodeURIComponent(em)}&sent=1`, { replace: true });
      })
      .catch((e: unknown) => {
        if (isRegisterUnverifiedExistingError(e)) {
          setLastLoginEmail(e.registerEmail);
          navigate(`/verify-email?email=${encodeURIComponent(e.registerEmail)}&resentHint=1`, {
            replace: true
          });
          return;
        }
        if (import.meta.env.DEV) {
          const ax = isAxiosError(e);
          console.error("[register] failed", {
            baseURL: SHARED_CORE_BASE_URL,
            fullURL: ax && e.config?.baseURL ? `${e.config.baseURL}${e.config.url ?? ""}` : undefined,
            path: "/auth/register",
            axiosCode: ax ? e.code : undefined,
            httpStatus: ax ? e.response?.status : undefined,
            responseBody: ax ? e.response?.data : undefined,
            message: ax ? e.message : undefined,
            err: e
          });
        }
        setErr(
          formatLoginErrorMessage(e, {
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
          <span className="shell-header__title">{r.headerTitle}</span>
          <span className="shell-header__meta">{u.login.headerMeta}</span>
        </header>
        <main className="workspace-container workspace-container--login">
          <div className="login-panel">
            <div className="page-stack page-narrow">
              <ContextDebugBanner />
              <header className="page-header">
                <h1 className="page-title">{r.pageTitle}</h1>
                <p className="page-lead">{r.pageLead}</p>
              </header>
              <Card title={r.cardTitle}>
                <form
                  className="login-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    runRegister();
                  }}
                >
                  <div className="form-field">
                    <label className="form-label" htmlFor="reg-email">
                      {r.email}
                    </label>
                    <Input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={u.login.phEmail}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="reg-password">
                      {r.password}
                    </label>
                    <div className="login-password-wrap">
                      <Input
                        id="reg-password"
                        type={passwordVisible ? "text" : "password"}
                        autoComplete="new-password"
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
                  <div className="form-field">
                    <label className="form-label" htmlFor="reg-password2">
                      {r.passwordConfirm}
                    </label>
                    <Input
                      id="reg-password2"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete="new-password"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      placeholder={u.login.phPassword}
                    />
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? r.submitting : r.submit}
                  </Button>
                </form>
                {err ? (
                  <p className="text-danger text-sm mt-2 mb-0" role="alert">
                    {err}
                  </p>
                ) : null}
                <div className="auth-auth-links">
                  <Link to="/login">{r.linkLogin}</Link>
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
