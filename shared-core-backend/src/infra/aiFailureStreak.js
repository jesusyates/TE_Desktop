/**
 * 同一用户连续 AI 提供商失败计数；超限后短暂强制 mock（防滥用/抖动保护）。
 */
const { logger } = require("./logger");
const { config } = require("./config");

/** @type {Map<string, { consecutive: number, degradedUntil: number }>} */
const _state = new Map();

function _maxStreak() {
  const n = Number(config().aiFailureStreakMax);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

function _degradeMs() {
  const n = Number(config().aiFailureDegradeMs);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120_000;
}

function streakKey(userId) {
  const u = userId != null ? String(userId).trim() : "";
  return u || "anonymous";
}

function isAiDegraded(userId) {
  const k = streakKey(userId);
  const row = _state.get(k);
  if (!row) return false;
  const now = Date.now();
  if (row.degradedUntil > now) return true;
  if (row.degradedUntil > 0 && row.degradedUntil <= now) {
    row.degradedUntil = 0;
    row.consecutive = 0;
  }
  return false;
}

/**
 * OpenAI 等非业务错误导致的失败（executeForTask / standalone 路径）
 */
function recordAiProviderFailure(userId, requestId, code) {
  const k = streakKey(userId);
  const row = _state.get(k) || { consecutive: 0, degradedUntil: 0 };
  row.consecutive += 1;
  const max = _maxStreak();
  if (row.consecutive > max) {
    row.degradedUntil = Date.now() + _degradeMs();
    row.consecutive = 0;
    logger.warn({
      event: "abuse_risk",
      requestId: requestId || null,
      userId: k,
      reason: "ai_consecutive_failures",
      threshold: max,
      lastCode: code || null
    });
  }
  _state.set(k, row);
}

function recordAiProviderSuccess(userId) {
  const k = streakKey(userId);
  const row = _state.get(k);
  if (!row) return;
  row.consecutive = 0;
  row.degradedUntil = 0;
  _state.set(k, row);
}

module.exports = {
  isAiDegraded,
  recordAiProviderFailure,
  recordAiProviderSuccess,
  streakKey
};
