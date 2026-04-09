/**
 * C-7 — users.store 的 SQLite 实现（方法名与内存版一致）。
 *
 * 禁止：第二套用户目录；Desktop/Web 分裂 users 表；上层绕过 auth.repository 写用户。
 */
const { randomUUID } = require("crypto");
const usersRepo = require("../repositories/users.sqlite");
const { hashPassword } = require("../../auth/password.util");

function findByEmail(email) {
  return usersRepo.findByEmail(email);
}

function findById(userId) {
  return usersRepo.findById(userId);
}

function createUser({ email, password, market, locale, status }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const st =
    status != null && String(status).trim() !== "" ? String(status).trim() : "active";
  const row = {
    user_id: id,
    email: String(email)
      .trim()
      .toLowerCase(),
    password_hash: hashPassword(password),
    market: market || "global",
    locale: locale || "en-US",
    status: st,
    email_verified_at: st === "active" ? now : null,
    created_at: now,
    updated_at: now
  };
  usersRepo.insertUser(row);
  return {
    user_id: row.user_id,
    email: row.email,
    password_hash: row.password_hash,
    market: row.market,
    locale: row.locale,
    status: row.status,
    email_verified_at: row.email_verified_at
  };
}

function markUserActiveAndEmailVerified(userId) {
  return usersRepo.markUserActiveAndEmailVerified(userId);
}

/**
 * @param {string} userId
 * @param {string} plainPassword
 * @returns {{ changes: number }}
 */
function updatePassword(userId, plainPassword) {
  const hash = hashPassword(plainPassword);
  return usersRepo.updatePasswordHash(userId, hash);
}

function bootstrapFromEnv() {
  const email = process.env.AUTH_BOOTSTRAP_EMAIL;
  const password = process.env.AUTH_BOOTSTRAP_PASSWORD;
  const market = process.env.AUTH_BOOTSTRAP_MARKET || "cn";
  const locale = process.env.AUTH_BOOTSTRAP_LOCALE || "zh-CN";
  if (!email || !password) return;
  if (usersRepo.userExistsByEmail(email)) return;
  createUser({ email, password, market, locale });
}

module.exports = {
  findByEmail,
  findById,
  createUser,
  bootstrapFromEnv,
  markUserActiveAndEmailVerified,
  updatePassword
};
