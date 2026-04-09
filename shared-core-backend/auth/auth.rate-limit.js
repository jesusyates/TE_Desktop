/**
 * Auth v1 Step 2b：注册 / 登录 / 发码 / 校验 限流与反暴力破解（进程内内存；多实例需换 Redis 等）。
 *
 * 错误码：TOO_MANY_REQUESTS、TOO_MANY_ATTEMPTS（HTTP 429 + body.code）。
 */

"use strict";

/** @type {Map<string, { count: number; resetAt: number }>} */
const windows = new Map();

/** @type {Map<string, { consecutive: number; cooldownUntil: number }>} */
const loginState = new Map();

const WINDOW_MS = {
  REGISTER_IP: 15 * 60 * 1000,
  REGISTER_EMAIL: 60 * 60 * 1000,
  LOGIN_COMBO: 15 * 60 * 1000,
  SEND_EMAIL: 60 * 60 * 1000,
  SEND_IP: 60 * 60 * 1000,
  CODE_FAIL: 30 * 60 * 1000
};

const MAX = {
  REGISTER_PER_IP: 10,
  REGISTER_PER_EMAIL: 5,
  LOGIN_PER_COMBO: 25,
  LOGIN_CONSEC_FAIL_TO_COOLDOWN: 5,
  LOGIN_COOLDOWN_MS: 5 * 60 * 1000,
  SEND_PER_EMAIL: 4,
  SEND_PER_IP: 20,
  VERIFY_FAIL_ATTEMPTS: 10,
  RESET_FAIL_ATTEMPTS: 10
};

function now() {
  return Date.now();
}

function currentWindowCount(key) {
  const t = now();
  const b = windows.get(key);
  if (!b || t > b.resetAt) return 0;
  return b.count;
}

/**
 * 固定窗口计数：本窗口内第 1 次命中时打开新窗口；超过 max 返回 false。
 */
function tryConsumeWindow(key, max, windowMs) {
  const t = now();
  let b = windows.get(key);
  if (!b || t > b.resetAt) {
    b = { count: 0, resetAt: t + windowMs };
    windows.set(key, b);
  }
  if (b.count >= max) {
    return false;
  }
  b.count += 1;
  return true;
}

/**
 * 仅增加失败计数（验证码错误等），不计入「尝试窗口」的 tryConsume。
 */
function incrementFailureCounter(key, windowMs, cap) {
  const t = now();
  let b = windows.get(key);
  if (!b || t > b.resetAt) {
    b = { count: 0, resetAt: t + windowMs };
    windows.set(key, b);
  }
  b.count += 1;
  return b.count >= cap;
}

function failureCountInWindow(key) {
  const b = windows.get(key);
  const t = now();
  if (!b || t > b.resetAt) return 0;
  return b.count;
}

function clearFailureCounter(key) {
  windows.delete(key);
}

function getClientIp(req) {
  if (!req || !req.headers) return "unknown";
  const xff = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"];
  if (xff && typeof xff === "string") {
    const first = xff.split(",")[0].trim();
    if (first) return first.slice(0, 128);
  }
  const socket = req.socket || req.connection;
  const addr = socket && socket.remoteAddress ? String(socket.remoteAddress) : "";
  return addr ? addr.slice(0, 128) : "unknown";
}

function registerAllow(ip, emailNorm) {
  const kIp = `reg:ip:${ip}`;
  const kEm = `reg:email:${emailNorm}`;
  if (currentWindowCount(kIp) >= MAX.REGISTER_PER_IP) return false;
  if (currentWindowCount(kEm) >= MAX.REGISTER_PER_EMAIL) return false;
  return (
    tryConsumeWindow(kIp, MAX.REGISTER_PER_IP, WINDOW_MS.REGISTER_IP) &&
    tryConsumeWindow(kEm, MAX.REGISTER_PER_EMAIL, WINDOW_MS.REGISTER_EMAIL)
  );
}

function loginCooldownRemainingMs(ip, emailNorm) {
  const key = `login:state:${ip}:${emailNorm}`;
  const s = loginState.get(key);
  if (!s) return 0;
  const t = now();
  if (s.cooldownUntil > t) return s.cooldownUntil - t;
  return 0;
}

function loginComboConsume(ip, emailNorm) {
  return tryConsumeWindow(`login:combo:${ip}:${emailNorm}`, MAX.LOGIN_PER_COMBO, WINDOW_MS.LOGIN_COMBO);
}

function recordLoginPasswordFailure(ip, emailNorm) {
  const key = `login:state:${ip}:${emailNorm}`;
  const t = now();
  let s = loginState.get(key) || { consecutive: 0, cooldownUntil: 0 };
  if (s.cooldownUntil > t) {
    loginState.set(key, s);
    return;
  }
  if (s.cooldownUntil > 0 && t >= s.cooldownUntil) {
    s = { consecutive: 0, cooldownUntil: 0 };
  }
  s.consecutive += 1;
  if (s.consecutive >= MAX.LOGIN_CONSEC_FAIL_TO_COOLDOWN) {
    s.cooldownUntil = t + MAX.LOGIN_COOLDOWN_MS;
    s.consecutive = 0;
  }
  loginState.set(key, s);
}

function clearLoginPasswordState(ip, emailNorm) {
  loginState.delete(`login:state:${ip}:${emailNorm}`);
}

function sendCodeAllow(ip, emailNorm) {
  const kIp = `send:ip:${ip}`;
  const kEm = `send:email:${emailNorm}`;
  if (currentWindowCount(kIp) >= MAX.SEND_PER_IP) return false;
  if (currentWindowCount(kEm) >= MAX.SEND_PER_EMAIL) return false;
  return (
    tryConsumeWindow(kEm, MAX.SEND_PER_EMAIL, WINDOW_MS.SEND_EMAIL) &&
    tryConsumeWindow(kIp, MAX.SEND_PER_IP, WINDOW_MS.SEND_IP)
  );
}

const KIND_VERIFY = "verify-email";
const KIND_RESET = "reset-password";

function codeCheckBlocked(kind, emailNorm) {
  const max = kind === KIND_VERIFY ? MAX.VERIFY_FAIL_ATTEMPTS : MAX.RESET_FAIL_ATTEMPTS;
  const key = `codefail:${kind}:${emailNorm}`;
  return failureCountInWindow(key) >= max;
}

/**
 * 校验失败时调用；返回 true 表示已达到上限（本轮可返回 TOO_MANY_ATTEMPTS）。
 */
function recordCodeCheckFailure(kind, emailNorm) {
  const max = kind === KIND_VERIFY ? MAX.VERIFY_FAIL_ATTEMPTS : MAX.RESET_FAIL_ATTEMPTS;
  const key = `codefail:${kind}:${emailNorm}`;
  return incrementFailureCounter(key, WINDOW_MS.CODE_FAIL, max);
}

function clearCodeCheckFailures(kind, emailNorm) {
  clearFailureCounter(`codefail:${kind}:${emailNorm}`);
}

module.exports = {
  getClientIp,
  registerAllow,
  loginCooldownRemainingMs,
  loginComboConsume,
  recordLoginPasswordFailure,
  clearLoginPasswordState,
  sendCodeAllow,
  codeCheckBlocked,
  recordCodeCheckFailure,
  clearCodeCheckFailures,
  KIND_VERIFY,
  KIND_RESET,
  MAX
};
