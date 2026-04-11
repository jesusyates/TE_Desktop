import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { resendVerificationEmail, verifyEmailAndSignIn, verifyEmailFromLinkToken } from "../services/authService";
import {
  buildVerifyEmailErrorStrings,
  formatVerifyEmailErrorMessage,
  getResendCooldownSecondsFromError
} from "../services/loginErrorMessage";
import { AUTH_RESEND_COOLDOWN_SECONDS, AUTH_VERIFICATION_RESEND_ENABLED, SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { setLastLoginEmail } from "../services/lastLoginEmail";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { useUiStrings } from "../i18n/useUiStrings";
import { ContextDebugBanner } from "../components/ContextDebugBanner";
import { AuthPublicShellHeader } from "../components/auth/AuthPublicShellHeader";
import { isValidEmailFormat, normalizeEmailInput } from "../modules/auth/authValidation";
import { runAuthPublicRouteInteractionCleanup } from "../services/authInteractionCleanup";

/** 验证页诊断日志（不含 token） */
function logVerifyFlow(phase: string, detail: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- 联调要求可观测
  console.info(`[auth-verify-flow] ${phase}`, detail);
}

/** 仅当注册成功链携带 `sent=1`（已发过邮件）时为 true；`resentHint` 需等实际发送成功后再置位。 */
function readVerifyHashSentOnce(): boolean {
  try {
    const h = window.location.hash || "";
    const qi = h.indexOf("?");
    if (qi < 0) return false;
    const q = new URLSearchParams(h.slice(qi + 1));
    return q.get("sent") === "1";
  } catch {
    return false;
  }
}

export const VerifyEmailPage = () => {
  const u = useUiStrings();
  const v = u.verifyEmail;
  const errStrings = useMemo(() => buildVerifyEmailErrorStrings(u), [u]);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);
  const hydrate = useAuthStore((s) => s.hydrate);
  const emailInitial = searchParams.get("email")?.trim() ?? "";
  const [email, setEmail] = useState(emailInitial);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  /** 是否已成功发出过至少一次验证码（含注册后 sent=1、resentHint 自动发、用户手动发送） */
  const [hasEverSentCode, setHasEverSentCode] = useState(readVerifyHashSentOnce);
  const strippedSentRef = useRef(false);
  const resentHintFlowRef = useRef(false);
  const [fromRegisterUnverifiedHint, setFromRegisterUnverifiedHint] = useState(false);
  const fromLoginFlow = searchParams.get("fromLogin") === "1";
  const fromRegDupFlow = searchParams.get("fromRegDup") === "1";

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[auth] baseURL:", SHARED_CORE_BASE_URL);
    }
  }, []);

  useLayoutEffect(() => {
    runAuthPublicRouteInteractionCleanup(`verify-email-layout:${location.pathname}`, location.pathname, {
      focusFirstInputId: "ve-email"
    });
  }, [location.pathname]);

  useEffect(() => {
    if (emailInitial) setEmail(emailInitial);
  }, [emailInitial]);

  useEffect(() => {
    if (accessToken.trim() && userId.trim()) navigate("/workbench", { replace: true });
  }, [accessToken, userId, navigate]);

  const applyResendCooldown = (sec: number) => {
    const s = Math.max(0, Math.ceil(sec));
    if (s > 0) setResendSecondsLeft(s);
  };

  useEffect(() => {
    if (strippedSentRef.current) return;
    if (searchParams.get("sent") === "1" && emailInitial) {
      strippedSentRef.current = true;
      applyResendCooldown(AUTH_RESEND_COOLDOWN_SECONDS);
      navigate(`/verify-email?email=${encodeURIComponent(emailInitial)}`, { replace: true });
    }
  }, [searchParams, emailInitial, navigate]);

  /** 从注册页：邮箱已存在但未验证 → 可选自动重发并去掉 resentHint，保留引导文案 */
  useEffect(() => {
    if (resentHintFlowRef.current) return;
    if (searchParams.get("resentHint") !== "1" || !emailInitial) return;
    resentHintFlowRef.current = true;
    setFromRegisterUnverifiedHint(true);
    const em = emailInitial;
    const stripQuery = () => navigate(`/verify-email?email=${encodeURIComponent(em)}`, { replace: true });
    if (AUTH_VERIFICATION_RESEND_ENABLED) {
      logVerifyFlow("resend_auto_start", { email: em });
      setResendBusy(true);
      setErr("");
      void resendVerificationEmail(em)
        .then(() => {
          logVerifyFlow("resend_auto_success", { email: em });
          setHasEverSentCode(true);
          setInfo(v.resendOk);
          applyResendCooldown(AUTH_RESEND_COOLDOWN_SECONDS);
        })
        .catch((e: unknown) => {
          logVerifyFlow("resend_auto_error", {
            email: em,
            message: e instanceof Error ? e.message : String(e)
          });
          const rem = getResendCooldownSecondsFromError(e);
          if (rem != null) applyResendCooldown(rem);
          setErr(formatVerifyEmailErrorMessage(e, errStrings));
        })
        .finally(() => {
          setResendBusy(false);
          stripQuery();
        });
    } else {
      stripQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot resentHint; v.resendOk from closure
  }, [searchParams, emailInitial, navigate, errStrings]);

  const resendCountingDown = resendSecondsLeft > 0;
  useEffect(() => {
    if (!resendCountingDown) return;
    const id = window.setInterval(() => {
      setResendSecondsLeft((n) => (n <= 1 ? 0 : n - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [resendCountingDown]);

  const linkTokenConsumedRef = useRef(false);
  useEffect(() => {
    if (linkTokenConsumedRef.current) return;
    const th = searchParams.get("token_hash")?.trim() || searchParams.get("token")?.trim();
    const typRaw = searchParams.get("type")?.trim();
    const typ = typRaw && typRaw.length > 0 ? typRaw : undefined;
    if (!th || th.length < 8) return;
    linkTokenConsumedRef.current = true;
    setBusy(true);
    setErr("");
    void verifyEmailFromLinkToken(th, typ)
      .then(() => {
        if (emailInitial) setLastLoginEmail(emailInitial);
        setBusy(false);
        navigate("/workbench", { replace: true });
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message.trim() : "";
        if (/请使用密码登录|邮箱已验证/.test(msg)) {
         navigate("/login?emailVerified=1", { replace: true });
          return;
        }
        setErr(formatVerifyEmailErrorMessage(e, errStrings));
      })
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot magic link; errStrings stable per locale
  }, [searchParams, emailInitial, navigate, errStrings]);

  const runVerify = () => {
    if (busy) return;
    setErr("");
    setInfo("");
    const em = email.trim();
    if (!em) {
      setErr(v.emailRequired);
      return;
    }
    if (code.trim().length < 6) {
      setErr(v.codeRequired);
      return;
    }
    setBusy(true);
    void verifyEmailAndSignIn(em, code.trim())
      .then(() => {
        setLastLoginEmail(em);
        setBusy(false);
        navigate("/workbench", { replace: true });
      })
      .catch((e: unknown) => {
        setErr(formatVerifyEmailErrorMessage(e, errStrings));
      })
      .finally(() => setBusy(false));
  };

  const runResend = () => {
    if (resendBusy || !AUTH_VERIFICATION_RESEND_ENABLED || resendSecondsLeft > 0) return;
    setErr("");
    setInfo("");
    const em = normalizeEmailInput(email);
    if (!em) {
      setErr(v.emailRequired);
      return;
    }
    if (!isValidEmailFormat(em)) {
      setErr(u.login.errorInvalidEmailFormat);
      return;
    }
    setResendBusy(true);
    logVerifyFlow("resend_manual_start", { email: em });
    void resendVerificationEmail(em)
      .then(() => {
        logVerifyFlow("resend_manual_success", { email: em });
        setHasEverSentCode(true);
        setInfo(v.resendOk);
        applyResendCooldown(AUTH_RESEND_COOLDOWN_SECONDS);
      })
      .catch((e: unknown) => {
        logVerifyFlow("resend_manual_error", {
          email: em,
          message: e instanceof Error ? e.message : String(e)
        });
        const rem = getResendCooldownSecondsFromError(e);
        if (rem != null) applyResendCooldown(rem);
        setErr(formatVerifyEmailErrorMessage(e, errStrings));
      })
      .finally(() => setResendBusy(false));
  };

  const displayEmail = (email.trim() || emailInitial).trim();

  return (
    <div className="shell-root app-root login-shell">
      <section className="shell-main login-shell__main">
        <AuthPublicShellHeader title={v.headerTitle} meta={u.login.headerMeta} />
        <main className="workspace-container workspace-container--login">
          <div className="login-panel">
            <div className="page-stack page-narrow">
              <ContextDebugBanner />
              <header className="page-header">
                <h1 className="page-title">{v.pageTitle}</h1>
                <p className="page-lead">{v.pageLead}</p>
              </header>
              <Card title={v.cardTitle}>
                {fromLoginFlow ? (
                  <p className="verify-email-page__reregister-hint text-muted text-sm mt-0 mb-3" role="status">
                    {v.fromLoginBanner}
                  </p>
                ) : null}
                {fromRegisterUnverifiedHint ? (
                  <p className="verify-email-page__reregister-hint text-muted text-sm mt-0 mb-3" role="status">
                    {v.alreadyRegisteredUnverifiedHint}
                  </p>
                ) : fromRegDupFlow ? (
                  <p className="verify-email-page__reregister-hint text-muted text-sm mt-0 mb-3" role="status">
                    {v.fromRegDupBanner}
                  </p>
                ) : null}
                <form
                  className="login-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    runVerify();
                  }}
                >
                  <div className="form-field">
                    <label className="form-label" htmlFor="ve-email">
                      {v.emailLabel}
                    </label>
                    <Input
                      id="ve-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={u.login.phEmail}
                      disabled={Boolean(emailInitial)}
                    />
                  </div>
                  {displayEmail ? (
                    <p className="verify-email-page__sent text-muted text-sm mt-0 mb-2" role="status">
                      {v.codeSentBanner.replace("{email}", displayEmail)}
                    </p>
                  ) : null}
                  <div className="form-field">
                    <label className="form-label" htmlFor="ve-code">
                      {v.codeLabel}
                    </label>
                    <Input
                      id="ve-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder={v.codePlaceholder}
                    />
                  </div>
                  <Button type="submit" disabled={busy}>
                    {busy ? v.submitting : v.submit}
                  </Button>
                </form>
                {err ? (
                  <pre
                    className="verify-email-page__alert text-danger text-sm mt-2 mb-0 whitespace-pre-wrap break-words font-sans"
                    role="alert"
                  >
                    {err}
                  </pre>
                ) : null}
                {info ? (
                  <p className="verify-email-page__info text-muted text-sm mt-2 mb-0" role="status">
                    {info}
                  </p>
                ) : null}
                <div className="auth-auth-links verify-email-page__footer">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={
                      resendBusy || resendSecondsLeft > 0 || !AUTH_VERIFICATION_RESEND_ENABLED
                    }
                    title={!AUTH_VERIFICATION_RESEND_ENABLED ? v.resendUnavailable : undefined}
                    onClick={() => void runResend()}
                  >
                    {resendBusy
                      ? v.resendBusy
                      : resendSecondsLeft > 0
                        ? u.login.resendCooldownIn.replace("{n}", String(resendSecondsLeft))
                        : hasEverSentCode
                          ? v.resend
                          : v.sendVerificationCode}
                  </Button>
                  {!AUTH_VERIFICATION_RESEND_ENABLED ? (
                    <span className="text-muted text-sm">{v.resendUnavailable}</span>
                  ) : null}
                  <span className="text-muted mx-1">·</span>
                  <Link to="/login">{v.linkLogin}</Link>
                </div>
              </Card>
            </div>
          </div>
        </main>
      </section>
    </div>
  );
};
