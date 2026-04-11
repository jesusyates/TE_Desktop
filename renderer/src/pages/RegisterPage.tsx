import { useEffect, useLayoutEffect, useState } from "react";
import { isAxiosError } from "axios";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { registerAccountOnly } from "../services/authService";
import {
  isRegisterUnverifiedExistingError,
  isRegisterVerifiedExistingError
} from "../services/authApi";
import { buildAuthFlowErrorStrings, formatLoginErrorMessage } from "../services/loginErrorMessage";
import { isValidEmailFormat, normalizeEmailInput } from "../modules/auth/authValidation";
import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { buildVerifyEmailUrl } from "../services/authVerificationFlow";
import { setLastLoginEmail } from "../services/lastLoginEmail";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { LoginEmailInputWithSuggest } from "../components/auth/LoginEmailInputWithSuggest";
import { useUiStrings } from "../i18n/useUiStrings";
import { ContextDebugBanner } from "../components/ContextDebugBanner";
import { AuthOauthPlaceholder } from "../components/auth/AuthOauthPlaceholder";
import { AuthPublicShellHeader } from "../components/auth/AuthPublicShellHeader";
import { runAuthPublicRouteInteractionCleanup } from "../services/authInteractionCleanup";

const MIN_PASSWORD = 8;

export const RegisterPage = () => {
  const u = useUiStrings();
  const r = u.register;
  const location = useLocation();
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

  useLayoutEffect(() => {
    runAuthPublicRouteInteractionCleanup(`register-layout:${location.pathname}`, location.pathname, {
      focusFirstInputId: "reg-email"
    });
  }, [location.pathname]);

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
        navigate(buildVerifyEmailUrl(em, { sent: true }), { replace: true });
      })
      .catch((e: unknown) => {
        if (isRegisterVerifiedExistingError(e)) {
          setErr(formatLoginErrorMessage(e, buildAuthFlowErrorStrings(u)));
          return;
        }
        if (isRegisterUnverifiedExistingError(e)) {
          setLastLoginEmail(e.registerEmail);
          navigate(buildVerifyEmailUrl(e.registerEmail, { resentHint: true, fromRegDup: true }), {
            replace: true
          });
          return;
        }
        if (import.meta.env.DEV) {
          const ax = isAxiosError(e);
          console.error("[register] failed", {
            baseURL: SHARED_CORE_BASE_URL,
            fullURL: ax && e.config?.baseURL ? `${e.config.baseURL}${e.config.url ?? ""}` : undefined,
            path: "/v1/auth/register",
            axiosCode: ax ? e.code : undefined,
            httpStatus: ax ? e.response?.status : undefined,
            responseBody: ax ? e.response?.data : undefined,
            message: ax ? e.message : undefined,
            err: e
          });
        }
        setErr(formatLoginErrorMessage(e, buildAuthFlowErrorStrings(u)));
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="shell-root app-root login-shell">
      <section className="shell-main login-shell__main">
        <AuthPublicShellHeader title={r.headerTitle} meta={u.login.headerMeta} />
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
                    <LoginEmailInputWithSuggest
                      id="reg-email"
                      value={email}
                      onChange={setEmail}
                      placeholder={u.login.phEmail}
                      autoComplete="email"
                      enableHistory={false}
                      enableDomainSuggest={true}
                      labels={{
                        recentBadge: "",
                        recommendedBadge: u.login.emailSuggestDomain,
                        clearHistory: "",
                        removeFromHistoryAria: ""
                      }}
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
                  <pre
                    className="text-danger text-sm mt-2 mb-0 whitespace-pre-wrap break-words font-sans"
                    role="alert"
                  >
                    {err}
                  </pre>
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
