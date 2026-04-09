/**
 * 邮箱验证码 / 重置码重发最小间隔（服务端强制，与客户端展示一致）。
 */
const COOLDOWN_MS = 120 * 1000;

/** @type {Map<string, number>} */
const verifyLastSent = new Map();

/** @type {Map<string, number>} */
const resetLastSent = new Map();

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function remainingSecondsFromLast(lastTs) {
  if (lastTs == null || !Number.isFinite(lastTs)) return 0;
  const remMs = COOLDOWN_MS - (Date.now() - lastTs);
  if (remMs <= 0) return 0;
  return Math.max(1, Math.ceil(remMs / 1000));
}

function getVerifyRemainingSeconds(email) {
  return remainingSecondsFromLast(verifyLastSent.get(normalizeEmail(email)));
}

function recordVerifySent(email) {
  verifyLastSent.set(normalizeEmail(email), Date.now());
}

function getResetRemainingSeconds(email) {
  return remainingSecondsFromLast(resetLastSent.get(normalizeEmail(email)));
}

function recordResetSent(email) {
  resetLastSent.set(normalizeEmail(email), Date.now());
}

module.exports = {
  COOLDOWN_MS,
  getVerifyRemainingSeconds,
  recordVerifySent,
  getResetRemainingSeconds,
  recordResetSent
};
