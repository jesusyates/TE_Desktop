#!/usr/bin/env node
/**
 * 开发验收：将指定用户的 entitlement.used 调到 quota-1，便于 1~2 次任务稳定触发 402。
 * 用法（在仓库根目录）：
 *   node shared-core-backend/scripts/dev-near-quota.js
 *   或指定邮箱：node shared-core-backend/scripts/dev-near-quota.js user@example.com
 * 环境：SHARED_CORE_DB_PATH（可选）；AUTH_BOOTSTRAP_EMAIL 可作为默认邮箱。
 * 禁止用于生产。
 */
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

function resolveDbPath() {
  const raw = process.env.SHARED_CORE_DB_PATH;
  if (raw && path.isAbsolute(raw)) return raw;
  if (raw) return path.resolve(process.cwd(), raw);
  return path.resolve(__dirname, "..", "storage", "shared-core.sqlite");
}

const emailArg = (process.argv[2] || process.env.AUTH_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
if (!emailArg) {
  console.error("dev-near-quota: set AUTH_BOOTSTRAP_EMAIL or pass email as first argument.");
  process.exit(1);
}

let DatabaseCtor;
try {
  ({ DatabaseSync: DatabaseCtor } = require("node:sqlite"));
} catch {
  console.error("dev-near-quota: requires Node 22+ (node:sqlite).");
  process.exit(1);
}

const dbPath = resolveDbPath();
const db = new DatabaseCtor(dbPath);
const user = db.prepare("SELECT user_id, email FROM users WHERE lower(email) = ?").get(emailArg);
if (!user) {
  console.error("dev-near-quota: user not found for email:", emailArg);
  process.exit(1);
}

const product = "aics";
let ent = db.prepare("SELECT quota, used FROM entitlements WHERE user_id = ? AND product = ?").get(user.user_id, product);
if (!ent) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO entitlements (user_id, product, plan, quota, used, status, created_at, updated_at)
     VALUES (?, ?, 'free', 100, 0, 'active', ?, ?)`
  ).run(user.user_id, product, now, now);
  ent = { quota: 100, used: 0 };
}

const targetUsed = Math.max(0, Number(ent.quota) - 1);
const nowIso = new Date().toISOString();
db.prepare("UPDATE entitlements SET used = ?, updated_at = ? WHERE user_id = ? AND product = ?").run(
  targetUsed,
  nowIso,
  user.user_id,
  product
);

console.log(
  JSON.stringify(
    {
      ok: true,
      email: emailArg,
      user_id: user.user_id,
      product,
      quota: ent.quota,
      used_before: ent.used,
      used_after: targetUsed,
      note: "Run one generate-heavy task (or two if planner uses multiple steps) to expect HTTP 402 quota_exceeded."
    },
    null,
    2
  )
);

db.close();
