/**
 * 模块 C — 口令存储使用 Node 原生 scrypt。
 * 禁止：明文存密码；禁止不经 Shared Core 的平行口令目录。
 */
const crypto = require("crypto");

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !plain) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const hash = crypto.scryptSync(plain, salt, expected.length, SCRYPT_PARAMS);
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

module.exports = { hashPassword, verifyPassword };
