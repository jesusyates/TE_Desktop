/**
 * C-7 — refresh_tokens 表访问。
 */
const { getDb } = require("../db");

function saveActive(jti, userId, expiresAtIso, createdAtIso, updatedAtIso) {
  getDb()
    .prepare(
      `INSERT INTO refresh_tokens (jti, user_id, expires_at, revoked, created_at, updated_at)
       VALUES (@jti, @user_id, @expires_at, 0, @created_at, @updated_at)
       ON CONFLICT(jti) DO UPDATE SET
         user_id = excluded.user_id,
         expires_at = excluded.expires_at,
         revoked = 0,
         updated_at = excluded.updated_at`
    )
    .run({
      jti,
      user_id: userId,
      expires_at: expiresAtIso,
      created_at: createdAtIso,
      updated_at: updatedAtIso
    });
}

function findActiveByJti(jti, nowIso) {
  return getDb()
    .prepare(
      `SELECT jti, user_id, expires_at, revoked FROM refresh_tokens
       WHERE jti = ? AND revoked = 0 AND expires_at > ?`
    )
    .get(jti, nowIso);
}

function revokeJti(jti, updatedAtIso) {
  getDb()
    .prepare(
      `UPDATE refresh_tokens SET revoked = 1, updated_at = ? WHERE jti = ?`
    )
    .run(updatedAtIso, jti);
}

function revokeAllForUser(userId, updatedAtIso) {
  const id = String(userId || "").trim();
  if (!id) return;
  getDb()
    .prepare(
      `UPDATE refresh_tokens SET revoked = 1, updated_at = ? WHERE user_id = ? AND revoked = 0`
    )
    .run(updatedAtIso, id);
}

module.exports = { saveActive, findActiveByJti, revokeJti, revokeAllForUser };
