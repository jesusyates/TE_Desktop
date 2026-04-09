/**
 * Auth：邮箱格式校验（注册/敏感入口统一规则）。
 * 规则：去空白后校验；本地部分非空；单 @；域名含 .；最后一节（TLD）至少 2 字符；无含空格邮箱。
 */

"use strict";

function normalizeEmailInput(email) {
  return String(email || "").trim();
}

/**
 * @param {string} emailRaw 已 trim 或待 trim 的邮箱
 */
function isValidEmailFormat(emailRaw) {
  const email = String(emailRaw || "").trim();
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

module.exports = { normalizeEmailInput, isValidEmailFormat };
