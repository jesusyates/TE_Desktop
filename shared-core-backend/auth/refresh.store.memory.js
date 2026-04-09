/**
 * refresh token jti — 内存实现。
 */
const activeRefresh = new Map();
/** @type {Set<string>} */
const revokedJti = new Set();

function remember(jti, userId, ttlMs) {
  revokedJti.delete(jti);
  activeRefresh.set(jti, { userId, exp: Date.now() + ttlMs });
}

function isActive(jti) {
  if (!jti) return false;
  if (revokedJti.has(jti)) return false;
  const row = activeRefresh.get(jti);
  if (!row) return false;
  if (Date.now() > row.exp) {
    activeRefresh.delete(jti);
    return false;
  }
  return true;
}

function revoke(jti) {
  if (jti) revokedJti.add(jti);
  activeRefresh.delete(jti);
}

function getActiveUserId(jti) {
  if (!jti || revokedJti.has(jti)) return null;
  const row = activeRefresh.get(jti);
  if (!row) return null;
  if (Date.now() > row.exp) {
    activeRefresh.delete(jti);
    return null;
  }
  return row.userId;
}

function revokeAllForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  for (const [jti, row] of activeRefresh) {
    if (row.userId === uid) {
      revokedJti.add(jti);
      activeRefresh.delete(jti);
    }
  }
}

function purgeExpired() {
  const t = Date.now();
  for (const [k, v] of activeRefresh) {
    if (t > v.exp) activeRefresh.delete(k);
  }
}

setInterval(purgeExpired, 60 * 1000).unref();

module.exports = { remember, isActive, revoke, getActiveUserId, revokeAllForUser };
