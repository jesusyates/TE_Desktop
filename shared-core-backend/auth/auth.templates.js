/**
 * Auth 邮件正文（zh / en）。locale 来自用户偏好或请求上下文（如 en-US、zh-CN）。
 */

function mailLocaleTag(locale) {
  const l = String(locale || "").toLowerCase();
  if (l.startsWith("zh")) return "zh";
  return "en";
}

function verificationEmail(locale, toEmail, code) {
  const tag = mailLocaleTag(locale);
  if (tag === "zh") {
    return {
      subject: "邮箱验证码",
      text:
        `你正在验证 AICS 账户邮箱。验证码：${code}，15 分钟内有效。\n` +
        `如非本人操作请忽略本邮件。\n\n` +
        `收件：${toEmail}\n`
    };
  }
  return {
    subject: "Your AICS verification code",
    text:
      `Your verification code is: ${code}. It expires in 15 minutes.\n` +
      `If you did not request this, you can ignore this email.\n\n` +
      `Recipient: ${toEmail}\n`
  };
}

function passwordResetEmail(locale, toEmail, code) {
  const tag = mailLocaleTag(locale);
  if (tag === "zh") {
    return {
      subject: "重置密码验证码",
      text:
        `你正在申请重置 AICS 账户密码。验证码：${code}，15 分钟内有效。\n` +
        `如非本人操作请忽略本邮件。\n\n` +
        `收件：${toEmail}\n`
    };
  }
  return {
    subject: "Your AICS password reset code",
    text:
      `Your password reset code is: ${code}. It expires in 15 minutes.\n` +
      `If you did not request a reset, ignore this email.\n\n` +
      `Recipient: ${toEmail}\n`
  };
}

module.exports = {
  mailLocaleTag,
  verificationEmail,
  passwordResetEmail
};
