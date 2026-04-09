import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { sendPasswordResetCode } from "../services/authService";
import { formatLoginErrorMessage, getResendCooldownSecondsFromError } from "../services/loginErrorMessage";
import { isValidEmailFormat, normalizeEmailInput } from "../modules/auth/authValidation";
import { AUTH_RESEND_COOLDOWN_SECONDS, SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useUiStrings } from "../i18n/useUiStrings";
import { ContextDebugBanner } from "../components/ContextDebugBanner";

export const ForgotPasswordPage = () => {
  const u = useUiStrings();
  const f = u.forgotPassword;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailQ = searchParams.get("email")?.trim() ?? "";
  const [email, setEmail] = useState(emailQ);
  useEffect(() => {
    if (emailQ) setEmail(emailQ);
  }, [emailQ]);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);

  const errStrings = {
    errorGeneric: u.login.error,
    errorInvalidCredentials: u.login.errorInvalidCredentials,
    errorInvalidEmailFormat: u.login.errorInvalidEmailFormat,
    errorNetwork: u.login.errorNetwork,
    errorEmailNotVerified: u.login.errorEmailNotVerified,
    errorTooManyRequests: u.login.errorTooManyRequests,
    errorTooManyAttempts: u.login.errorTooManyAttempts,
    resendCooldownWait: u.login.resendCooldownWait,
    resendCooldownIn: u.login.resendCooldownIn
  };

  const applyResendCooldown = (sec: number) => {
    const s = Math.max(0, Math.ceil(sec));
    if (s > 0) setResendSecondsLeft(s);
  };

  const resendCountingDown = resendSecondsLeft > 0;
  useEffect(() => {
    if (!resendCountingDown) return;
    const id = window.setInterval(() => {
      setResendSecondsLeft((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCountingDown]);

  const sendReset = () => {
    if (busy || resendBusy) return;
    if (sent && resendSecondsLeft > 0) return;
    setErr("");
    setInfo("");
    const em = normalizeEmailInput(email);
    if (!em) {
      setErr(f.emailRequired);
      return;
    }
    if (!isValidEmailFormat(em)) {
      setErr(u.login.errorInvalidEmailFormat);
      return;
    }
    const run = sent ? setResendBusy : setBusy;
    run(true);
    void sendPasswordResetCode(em)
      .then(() => {
        const wasResend = sent;
        setSent(true);
        applyResendCooldown(AUTH_RESEND_COOLDOWN_SECONDS);
        if (wasResend) setInfo(f.resendOk);
        else setInfo("");
      })
      .catch((e: unknown) => {
        if (import.meta.env.DEV) {
          console.error("[forgot-password] failed", { baseURL: SHARED_CORE_BASE_URL, err: e });
        }
        const rem = getResendCooldownSecondsFromError(e);
        if (rem != null) {
          applyResendCooldown(rem);
          setErr(u.login.resendCooldownWait);
          return;
        }
        setErr(formatLoginErrorMessage(e, errStrings));
      })
      .finally(() => run(false));
  };

  const displayEmail = normalizeEmailInput(email);

  return (
    <div className="shell-root app-root login-shell">
      <section className="shell-main login-shell__main">
        <header className="shell-header">
          <span className="shell-header__title">{f.headerTitle}</span>
          <span className="shell-header__meta">{u.login.headerMeta}</span>
        </header>
        <main className="workspace-container workspace-container--login">
          <div className="login-panel">
            <div className="page-stack page-narrow">
              <ContextDebugBanner />
              <header className="page-header">
                <h1 className="page-title">{f.pageTitle}</h1>
                <p className="page-lead">{f.pageLead}</p>
              </header>
              <Card title={f.cardTitle}>
                {sent ? (
                  <div className="login-email-verify-callout" role="status">
                    <p className="login-email-verify-callout__title">{f.successTitle}</p>
                    <p className="login-email-verify-callout__lead">{f.successLead}</p>
                    {displayEmail ? (
                      <p className="text-muted text-sm mt-2 mb-2">{f.codeSentBanner.replace("{email}", displayEmail)}</p>
                    ) : null}
                    <Button
                      type="button"
                      onClick={() => {
                        const em = email.trim();
                        navigate(`/reset-password?email=${encodeURIComponent(em)}`);
                      }}
                    >
                      {f.linkToReset}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2"
                      disabled={resendBusy || resendSecondsLeft > 0}
                      onClick={() => void sendReset()}
                    >
                      {resendBusy
                        ? f.resendBusy
                        : resendSecondsLeft > 0
                          ? u.login.resendCooldownIn.replace("{n}", String(resendSecondsLeft))
                          : f.resend}
                    </Button>
                  </div>
                ) : (
                  <form
                    className="login-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendReset();
                    }}
                  >
                    <div className="form-field">
                      <label className="form-label" htmlFor="fp-email">
                        {f.emailLabel}
                      </label>
                      <Input
                        id="fp-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={u.login.phEmail}
                      />
                    </div>
                    <Button type="submit" disabled={busy}>
                      {busy ? f.submitting : f.submit}
                    </Button>
                  </form>
                )}
                {info.trim() ? (
                  <p className="text-muted text-sm mt-2 mb-0" role="status">
                    {info}
                  </p>
                ) : null}
                {err ? (
                  <p className="text-danger text-sm mt-2 mb-0" role="alert">
                    {err}
                  </p>
                ) : null}
                <div className="auth-auth-links">
                  <Link to="/login">{f.linkLogin}</Link>
                </div>
              </Card>
            </div>
          </div>
        </main>
      </section>
    </div>
  );
};
