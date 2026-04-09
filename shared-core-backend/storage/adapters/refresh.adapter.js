/**
 * C-7 — refresh.store 的 SQLite 实现。
 *
 * 禁止：重启后复活已 revoke jti；跳过 Core 吊销。
 */
const refreshRepo = require("../repositories/refresh.sqlite");

function remember(jti, userId, ttlMs) {
  const now = new Date();
  const createdAtIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + ttlMs).toISOString();
  refreshRepo.saveActive(jti, userId, expiresAtIso, createdAtIso, createdAtIso);
}

function isActive(jti) {
  if (!jti) return false;
  const row = refreshRepo.findActiveByJti(jti, new Date().toISOString());
  return row != null;
}

function revoke(jti) {
  if (!jti) return;
  refreshRepo.revokeJti(jti, new Date().toISOString());
}

function getActiveUserId(jti) {
  if (!jti) return null;
  const row = refreshRepo.findActiveByJti(jti, new Date().toISOString());
  return row ? row.user_id : null;
}

function revokeAllForUser(userId) {
  refreshRepo.revokeAllForUser(userId, new Date().toISOString());
}

module.exports = { remember, isActive, revoke, getActiveUserId, revokeAllForUser };
