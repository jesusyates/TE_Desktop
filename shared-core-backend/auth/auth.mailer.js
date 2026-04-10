/**
 * Auth 发信：生产走 SMTP；开发可通过 AUTH_MAIL_SINK 使用 console/mock/none。
 * 生产环境禁止将验证码写入 console。
 * AUTH_PROVIDER=supabase 时由 Supabase Auth 发信；本模块禁止执行任何 sink / SMTP / 模板分支。
 */
const templates = require("./auth.templates");
const { isAuthProviderSupabase } = require("./auth-provider.util");

function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function mailSinkMode() {
  const m = String(process.env.AUTH_MAIL_SINK || "").trim().toLowerCase();
  if (m === "console" || m === "smtp" || m === "mock" || m === "none") return m;
  return isProd() ? "smtp" : "console";
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function sendWithSmtp({ to, subject, text }) {
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    return { ok: false, error: "nodemailer_unavailable" };
  }

  const host = process.env.AUTH_SMTP_HOST;
  if (!host || !String(host).trim()) {
    return { ok: false, error: "smtp_host_missing" };
  }

  const portRaw = process.env.AUTH_SMTP_PORT;
  const port = portRaw != null && String(portRaw).trim() ? parseInt(String(portRaw), 10) : 587;
  const secure =
    String(process.env.AUTH_SMTP_SECURE || "").toLowerCase() === "true" ||
    port === 465 ||
    port === 3465;

  const user = process.env.AUTH_SMTP_USER;
  const pass = process.env.AUTH_SMTP_PASS;
  const transporter = nodemailer.createTransport({
    host: String(host).trim(),
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth:
      user != null && String(user).trim() && pass != null && String(pass).length > 0
        ? { user: String(user).trim(), pass: String(pass) }
        : undefined
  });

  const fromRaw = process.env.AUTH_MAIL_FROM;
  const from =
    fromRaw != null && String(fromRaw).trim()
      ? String(fromRaw).trim()
      : user != null && String(user).trim()
        ? String(user).trim()
        : `"AICS" <no-reply@localhost>`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text
  });

  return { ok: true };
}

/**
 * @param {{ to: string, locale: string | undefined, code: string, kind: 'verify' | 'reset' }} args
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function deliver({ to, locale, code, kind }) {
  if (isAuthProviderSupabase()) {
    throw new Error("MAILER_DISABLED_IN_SUPABASE_MODE");
  }

  const payload =
    kind === "verify"
      ? templates.verificationEmail(locale, to, code)
      : templates.passwordResetEmail(locale, to, code);

  const mode = mailSinkMode();

  if (mode === "console" && !isProd()) {
    // eslint-disable-next-line no-console -- dev sink
    console.log(`[auth][mail:sink] kind=${kind} to=${to} subject=${payload.subject}`);
    // eslint-disable-next-line no-console -- dev sink（允许含验证码）
    console.log(`[auth][mail:sink] code=${code}`);
    return { ok: true };
  }

  if (mode === "mock" && !isProd()) {
    // eslint-disable-next-line no-console
    console.log(`[auth][mail:mock] kind=${kind} to=${to} subject=${payload.subject} (not sent)`);
    return { ok: true };
  }

  if (mode === "none" && !isProd()) {
    // eslint-disable-next-line no-console
    console.log(`[auth][mail:none] kind=${kind} to=${to} (skipped)`);
    return { ok: true };
  }

  try {
    const smtp = await sendWithSmtp({
      to,
      subject: payload.subject,
      text: payload.text
    });

    if (smtp.ok) return { ok: true };

    if (!isProd() && (smtp.error === "smtp_host_missing" || smtp.error === "nodemailer_unavailable")) {
      // eslint-disable-next-line no-console -- 开发无 SMTP 时的兜底，仅非 production
      console.log(`[auth][mail:dev-fallback] kind=${kind} to=${to} reason=${smtp.error} code=${code}`);
      return { ok: true };
    }

    if (isProd()) {
      // eslint-disable-next-line no-console
      console.error(`[auth][mail] send_failed kind=${kind} to=${to} err=${smtp.error}`);
    } else {
      // eslint-disable-next-line no-console
      console.error(`[auth][mail] send_failed kind=${kind} to=${to} err=${smtp.error}`);
    }
    return { ok: false, error: smtp.error };
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "send_exception";
    // eslint-disable-next-line no-console
    console.error(`[auth][mail] exception kind=${kind} to=${to}`, isProd() ? "(detail redacted in prod)" : msg);
    return { ok: false, error: "send_exception" };
  }
}

function sendVerificationCode({ to, locale, code }) {
  return deliver({ to, locale, code, kind: "verify" });
}

function sendPasswordResetCode({ to, locale, code }) {
  return deliver({ to, locale, code, kind: "reset" });
}

module.exports = {
  mailSinkMode,
  sendVerificationCode,
  sendPasswordResetCode
};
