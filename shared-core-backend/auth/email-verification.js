/**
 * Auth v1：邮箱验证码（内存 TTL；发信由 auth.mailer 负责）。
 */
const { randomInt } = require("crypto");

/** @type {Map<string, { code: string, expiresAt: number }>} */
const byEmail = new Map();

const TTL_MS = 15 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function generateSixDigit() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * 生成并存入验证码；返回明文 code（仅用于 dev 日志）。
 */
function issueCode(email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  const code = generateSixDigit();
  byEmail.set(key, { code, expiresAt: Date.now() + TTL_MS });
  return code;
}

function sendDevLog(email, code) {
  const em = normalizeEmail(email);
  console.log(`[auth][email-verify] verification code for ${em}: ${code}`);
}

/**
 * 校验并消费验证码（成功返回 true）。
 */
function verifyAndConsume(email, inputCode) {
  const key = normalizeEmail(email);
  if (!key || inputCode == null) return false;
  const row = byEmail.get(key);
  if (!row) return false;
  if (Date.now() > row.expiresAt) {
    byEmail.delete(key);
    return false;
  }
  if (String(inputCode).trim() !== row.code) return false;
  byEmail.delete(key);
  return true;
}

function clearForEmail(email) {
  byEmail.delete(normalizeEmail(email));
}

module.exports = {
  issueCode,
  sendDevLog,
  verifyAndConsume,
  clearForEmail,
  normalizeEmail
};
