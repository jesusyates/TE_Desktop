/**
 * Auth v1 Step 2：密码重置验证码（独立存储；发信由 auth.mailer 负责）。
 * 校验成功即消费，不可重复使用。
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

function issueCode(email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  const code = generateSixDigit();
  byEmail.set(key, { code, expiresAt: Date.now() + TTL_MS });
  return code;
}

function sendDevLog(email, code) {
  const em = normalizeEmail(email);
  console.log(`[auth][password-reset] reset code for ${em}: ${code}`);
}

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

module.exports = {
  issueCode,
  sendDevLog,
  verifyAndConsume,
  normalizeEmail
};
