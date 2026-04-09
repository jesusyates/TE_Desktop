/**
 * C-7 — entitlements 表访问与原子扣减（BEGIN IMMEDIATE 事务）。
 */
const { getDb } = require("../db");

function normalizeRow(r) {
  return {
    user_id: r.user_id,
    product: r.product,
    plan: r.plan,
    quota: r.quota,
    used: r.used,
    status: r.status
  };
}

function selectEntitlement(user_id, product) {
  const r = getDb()
    .prepare(`SELECT * FROM entitlements WHERE user_id = ? AND product = ?`)
    .get(user_id, product);
  return r || null;
}

function insertDefaultEntitlement(user_id, product, nowIso) {
  getDb()
    .prepare(
      `INSERT INTO entitlements (user_id, product, plan, quota, used, status, created_at, updated_at)
       VALUES (?, ?, 'free', 100, 0, 'active', ?, ?)`
    )
    .run(user_id, product, nowIso, nowIso);
}

/**
 * @returns {{ user_id, product, plan, quota, used, status }}
 */
function getOrCreate(user_id, product) {
  const now = new Date().toISOString();
  let r = selectEntitlement(user_id, product);
  if (r) return normalizeRow(r);
  try {
    insertDefaultEntitlement(user_id, product, now);
  } catch (e) {
    if (!String(e.code || "").includes("SQLITE_CONSTRAINT")) throw e;
  }
  r = selectEntitlement(user_id, product);
  if (!r) throw new Error("entitlement_get_or_create_failed");
  return normalizeRow(r);
}

/**
 * @param {object} [meta] — C-8：market, locale, client_platform, session_version, task_id
 * @returns {{ ok: true, entitlement: object } | { ok: false, code: string }}
 */
function atomicConsume(user_id, product, action, amount, meta = {}) {
  const db = getDb();
  const now = new Date().toISOString();
  const {
    market = null,
    locale = null,
    client_platform = null,
    session_version = null,
    task_id = null
  } = meta || {};

  db.exec("BEGIN IMMEDIATE;");
  try {
    let ent = db.prepare(`SELECT * FROM entitlements WHERE user_id = ? AND product = ?`).get(user_id, product);
    if (!ent) {
      db.prepare(
        `INSERT INTO entitlements (user_id, product, plan, quota, used, status, created_at, updated_at)
         VALUES (?, ?, 'free', 100, 0, 'active', ?, ?)`
      ).run(user_id, product, now, now);
      ent = db.prepare(`SELECT * FROM entitlements WHERE user_id = ? AND product = ?`).get(user_id, product);
    }
    if (ent.status !== "active") {
      db.exec("ROLLBACK;");
      return { ok: false, code: "entitlement_inactive" };
    }
    if (ent.used + amount > ent.quota) {
      db.exec("ROLLBACK;");
      return { ok: false, code: "quota_exceeded" };
    }
    db.prepare(
      `UPDATE entitlements SET used = used + ?, updated_at = ? WHERE user_id = ? AND product = ?`
    ).run(amount, now, user_id, product);
    db.prepare(
      `INSERT INTO usage_events (user_id, product, action, amount, timestamp, market, locale, client_platform, session_version, task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user_id,
      product,
      action,
      amount,
      now,
      market,
      locale,
      client_platform,
      session_version,
      task_id
    );
    const updated = db
      .prepare(`SELECT * FROM entitlements WHERE user_id = ? AND product = ?`)
      .get(user_id, product);
    db.exec("COMMIT;");
    return {
      ok: true,
      entitlement: {
        plan: updated.plan,
        quota: updated.quota,
        used: updated.used,
        status: updated.status
      }
    };
  } catch (e) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* ignore */
    }
    throw e;
  }
}

module.exports = { getOrCreate, atomicConsume, selectEntitlement };
