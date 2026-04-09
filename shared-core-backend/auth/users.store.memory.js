/**
 * MODULE C — users 内存实现（SHARED_CORE_STORAGE=memory）。
 */
const { randomUUID } = require("crypto");
const { hashPassword } = require("./password.util");

const usersByEmail = new Map();
const usersById = new Map();

function findByEmail(email) {
  const key = String(email || "")
    .trim()
    .toLowerCase();
  return usersByEmail.get(key) || null;
}

function findById(userId) {
  return usersById.get(userId) || null;
}

function createUser({ email, password, market, locale, status }) {
  const id = randomUUID();
  const st =
    status != null && String(status).trim() !== "" ? String(status).trim() : "active";
  const now = new Date().toISOString();
  const row = {
    user_id: id,
    email: String(email)
      .trim()
      .toLowerCase(),
    password_hash: hashPassword(password),
    market: market || "global",
    locale: locale || "en-US",
    status: st,
    email_verified_at: st === "active" ? now : null
  };
  usersByEmail.set(row.email, row);
  usersById.set(id, row);
  return row;
}

function markUserActiveAndEmailVerified(userId) {
  const u = usersById.get(String(userId || "").trim());
  if (!u || String(u.status).toLowerCase() !== "pending_verification") {
    return { changes: 0 };
  }
  const now = new Date().toISOString();
  u.status = "active";
  u.email_verified_at = now;
  usersByEmail.set(u.email, u);
  return { changes: 1 };
}

function updatePassword(userId, plainPassword) {
  const u = usersById.get(String(userId || "").trim());
  if (!u) return { changes: 0 };
  u.password_hash = hashPassword(plainPassword);
  usersByEmail.set(u.email, u);
  return { changes: 1 };
}

function bootstrapFromEnv() {
  const email = process.env.AUTH_BOOTSTRAP_EMAIL;
  const password = process.env.AUTH_BOOTSTRAP_PASSWORD;
  const market = process.env.AUTH_BOOTSTRAP_MARKET || "cn";
  const locale = process.env.AUTH_BOOTSTRAP_LOCALE || "zh-CN";
  if (!email || !password) return;
  if (findByEmail(email)) return;
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
