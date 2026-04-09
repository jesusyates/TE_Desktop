/**
 * C-2 / C-7 — 持久化接口层；默认 SQLite（经 store 路由 → adapter → repository）。
 * handler 禁止直接触碰 users/refresh 底层实现。
 */
const usersStore = require("./users.store");
const refreshStore = require("./refresh.store");

function findUserByEmail(email) {
  return usersStore.findByEmail(email);
}

function findUserById(userId) {
  return usersStore.findById(userId);
}

function createUser(args) {
  return usersStore.createUser(args);
}

function markUserActiveAndEmailVerified(userId) {
  return usersStore.markUserActiveAndEmailVerified(userId);
}

function updateUserPassword(userId, plainPassword) {
  return usersStore.updatePassword(userId, plainPassword);
}

function bootstrapFromEnv() {
  return usersStore.bootstrapFromEnv();
}

/**
 * refresh jti 处于 active 且未吊销时返回 { user_id, jti }，否则 null。
 */
function findRefreshToken(jti) {
  if (!jti) return null;
  const uid = refreshStore.getActiveUserId(jti);
  if (!uid) return null;
  return { user_id: uid, jti };
}

function saveRefreshToken(jti, userId, ttlMs) {
  refreshStore.remember(jti, userId, ttlMs);
}

function revokeToken(jti) {
  refreshStore.revoke(jti);
}

function revokeAllRefreshTokensForUser(userId) {
  refreshStore.revokeAllForUser(userId);
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  markUserActiveAndEmailVerified,
  updateUserPassword,
  bootstrapFromEnv,
  findRefreshToken,
  saveRefreshToken,
  revokeToken,
  revokeAllRefreshTokensForUser
};
