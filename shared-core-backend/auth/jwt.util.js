/**
 * 模块 C / C-2 — HS256 JWT（HMAC-SHA256）；签名比较统一走 timingSafeEqual（见 verifyJwt）。
 * 禁止：客户端伪造未签名声明；禁止绕过 Shared Core 签发主流程 token。
 * Web 侧 refresh_token 后续应置于 httpOnly Secure Cookie（禁止 document 可读），与 Desktop 主进程存储对齐安全边界。
 */
const crypto = require("crypto");

function base64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
}

function signJwt(payload, secret, expiresInSec) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const headerPart = base64urlJson({ alg: "HS256", typ: "JWT" });
  const payloadPart = base64urlJson(body);
  const data = `${headerPart}.${payloadPart}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyJwt(token, secret) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  let sigBuf;
  let expBuf;
  try {
    sigBuf = Buffer.from(s, "base64url");
    expBuf = Buffer.from(expected, "base64url");
  } catch {
    return null;
  }
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) return null;
  return payload;
}

module.exports = { signJwt, verifyJwt };
