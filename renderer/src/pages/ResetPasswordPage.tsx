import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPasswordWithCode } from "../services/authService";
import { formatResetPasswordErrorMessage } from "../services/loginErrorMessage";
import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useUiStrings } from "../i18n/useUiStrings";
import { ContextDebugBanner } from "../components/ContextDebugBanner";
import { isValidEmailFormat, normalizeEmailInput } from "../modules/auth/authValidation";

const MIN_PASSWORD = 8;

export const ResetPasswordPage = () => {
  const u = useUiStrings();
  const rp = u.resetPassword;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailInitial = searchParams.get("email")?.trim() ?? "";
  const [email, setEmail] = useState(emailInitial);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (emailInitial) setEmail(emailInitial);
  }, [emailInitial]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[auth] baseURL:", SHARED_CORE_BASE_URL);
    }
  }, []);

  const errStrings = {
    errorGeneric: u.login.error,
    errorInvalidCredentials: u.login.errorInvalidCredentials,
    errorInvalidEmailFormat: u.login.errorInvalidEmailFormat,
    errorNetwork: u.login.errorNetwork,
    errorEmailNotVerified: u.login.errorEmailNotVerified,
    errorTooManyRequests: u.login.errorTooManyRequests,
    errorTooManyAttempts: u.login.errorTooManyAttempts,
    resendCooldownWait: u.login.resendCooldownWait,
    resendCooldownIn: u.login.resendCooldownIn,
    errorInvalidCode: rp.errorInvalidCode,
    errorAlreadyVerified: rp.errorAlreadyVerified,
    errorUserNotFound: rp.errorUserNotFound,
    errorResendNotApplicable: rp.errorResendNotApplicable,
    errorVerifyGeneric: rp.errorVerifyGeneric,
    emailRequired: rp.emailRequired,
    codeRequired: rp.codeRequired,
    errorNewPasswordShort: rp.errorNewPasswordShort,
    errorResetFailed: rp.errorResetFailed
  };

  const submit = () => {
    if (busy) return;
    setErr("");
    const em = normalizeEmailInput(email);
    if (!em) {
      setErr(rp.emailRequired);
      return;
    }
    if (!isValidEmailFormat(em)) {
      setErr(u.login.errorInvalidEmailFormat);
      return;
    }
    if (code.trim().length < 6) {
      setErr(rp.codeRequired);
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setErr(rp.errorPasswordShort);
      return;
    }
    if (password !== password2) {
      setErr(rp.errorPasswordMismatch);
      return;
    }
    setBusy(true);
    void resetPasswordWithCode(em, code.trim(), password)
      .then(() => {
        navigate("/login?passwordReset=1", { replace: true });
      })
      .catch((e: unknown) => {
        if (import.meta.env.DEV) {
          console.error("[reset-password] failed", { baseURL: SHARED_CORE_BASE_URL, err: e });
        }
        setErr(formatResetPasswordErrorMessage(e, errStrings));
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="shell-root app-root login-shell">
      <section className="shell-main login-shell__main">
        <header className="shell-header">
          <span className="shell-header__title">{rp.headerTitle}</span>
          <span className="shell-header__meta">{u.login.headerMeta}</span>
        </header>
        <main className="workspace-container workspace-container--login">
          <div className="login-panel">
            <div className="page-stack page-narrow">
              <ContextDebugBanner />
              <header className="page-header">
                <h1 className="page-title">{rp.pageTitle}</h1>
                <p className="page-lead">{rp.pageLead}</p>
              </header>
              <Card title={rp.cardTitle}>
                <form
                  className="login-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  <div className="form-field">
                    <label className="form-label" htmlFor="rp-email">
                      {rp.emailLabel}
                    </label>
                    <Input
                      id="rp-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={u.login.phEmail}
                      disabled={Boolean(emailInitial)}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="rp-code">
                      {rp.codeLabel}
                    </label>
                    <Input
                      id="rp-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder={rp.codePlaceholder}
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="rp-pass">
                      {rp.newPassword}
                    </label>
                    <div className="login-password-wrap">
                      <Input
                        id="rp-pass"
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
                    <label className="form-label" htmlFor="rp-pass2">
                      {rp.newPasswordConfirm}
                    </label>
                    <Input
                      id="rp-pass2"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete="new-password"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      placeholder={u.login.phPassword}
                    />
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? rp.submitting : rp.submit}
                  </Button>
                </form>
                {err ? (
                  <p className="verify-email-page__alert text-danger text-sm mt-2 mb-0" role="alert">
                    {err}
                  </p>
                ) : null}
                <div className="auth-auth-links verify-email-page__footer">
                  <Link
                    to={
                      email.trim()
                        ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
                        : "/forgot-password"
                    }
                  >
                    {rp.linkForgotResend}
                  </Link>
                  <span className="text-muted mx-1">·</span>
                  <Link to="/login">{rp.linkLogin}</Link>
                </div>
              </Card>
            </div>
          </div>
        </main>
      </section>
    </div>
  );
};
