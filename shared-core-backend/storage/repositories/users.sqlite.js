/**
 * C-7 — users 表访问。禁止被 handler/service 直接 require。
 */
const { getDb } = require("../db");

function rowToUser(r) {
  if (!r) return null;
  return {
    user_id: r.user_id,
    email: r.email,
    password_hash: r.password_hash,
    market: r.market,
    locale: r.locale,
    status: r.status != null && String(r.status).trim() !== "" ? String(r.status) : "active",
    email_verified_at:
      r.email_verified_at != null && String(r.email_verified_at).trim() !== ""
        ? String(r.email_verified_at)
        : null,
    created_at:
      r.created_at != null && String(r.created_at).trim() !== "" ? String(r.created_at) : null,
    updated_at:
      r.updated_at != null && String(r.updated_at).trim() !== "" ? String(r.updated_at) : null
  };
}

function findByEmail(email) {
  const key = String(email || "")
    .trim()
    .toLowerCase();
  const r = getDb()
    .prepare(
      `SELECT user_id, email, password_hash, market, locale, status, email_verified_at FROM users WHERE email = ?`
    )
    .get(key);
  return rowToUser(r);
}

function findById(userId) {
  const r = getDb()
    .prepare(
      `SELECT user_id, email, password_hash, market, locale, status, email_verified_at, created_at, updated_at FROM users WHERE user_id = ?`
    )
    .get(userId);
  return rowToUser(r);
}

function insertUser({
  user_id,
  email,
  password_hash,
  market,
  locale,
  status,
  email_verified_at,
  created_at,
  updated_at
}) {
  const st = status != null && String(status).trim() !== "" ? String(status) : "active";
  const ev =
    email_verified_at != null && String(email_verified_at).trim() !== ""
      ? String(email_verified_at).trim()
      : null;
  getDb()
    .prepare(
      `INSERT INTO users (user_id, email, password_hash, market, locale, status, email_verified_at, created_at, updated_at)
       VALUES (@user_id, @email, @password_hash, @market, @locale, @status, @email_verified_at, @created_at, @updated_at)`
    )
    .run({
      user_id,
      email,
      password_hash,
      market,
      locale,
      status: st,
      email_verified_at: ev,
      created_at,
      updated_at
    });
}

function markUserActiveAndEmailVerified(userId) {
  const id = String(userId || "").trim();
  if (!id) return { changes: 0 };
  const now = new Date().toISOString();
  return getDb()
    .prepare(
      `UPDATE users SET status = 'active', email_verified_at = ?, updated_at = ? WHERE user_id = ? AND status = 'pending_verification'`
    )
    .run(now, now, id);
}

function userExistsByEmail(email) {
  return findByEmail(email) != null;
}

function updatePasswordHash(userId, passwordHash) {
  const id = String(userId || "").trim();
  if (!id) return { changes: 0 };
  const now = new Date().toISOString();
  return getDb()
    .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?`)
    .run(String(passwordHash), now, id);
}

module.exports = {
  findByEmail,
  findById,
  insertUser,
  userExistsByEmail,
  markUserActiveAndEmailVerified,
  updatePasswordHash
};
