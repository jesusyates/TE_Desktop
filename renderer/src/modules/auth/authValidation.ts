/**
 * Auth：邮箱格式校验（注册/登录/找回/验证页共用）。
 * 与 Shared Core `auth.validation.js` 规则对齐：trim、本地非空、单 @、域名含 .、TLD≥2、无空白字符。
 */

export function normalizeEmailInput(raw: string): string {
  return String(raw || "").trim();
}

export function isValidEmailFormat(emailRaw: string): boolean {
  const email = normalizeEmailInput(emailRaw);
  if (!email) return false;
  if (/\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0) return false;
  if (at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain) return false;
  if (!domain.includes(".")) return false;
  const parts = domain.split(".");
  const tld = parts[parts.length - 1];
  if (!tld || tld.length < 2) return false;
  if (parts.some((p) => !p)) return false;
  return true;
}
