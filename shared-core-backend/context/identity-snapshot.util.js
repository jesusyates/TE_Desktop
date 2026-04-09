/**
 * C-8 — 执行时身份快照（单一真源，供 task / planner / usage / generate 只读复用）。
 *
 * 禁止：task / usage / audit 使用不同身份上下文；generate 重读 header 拼装身份；
 * 丢失 market/locale/product/client_platform；为对账再造一套 usage。
 */
const preferencesSync = require("../preferences/preferences-sync.service");
const { isValidMarket } = require("../config/market.config");
const { isValidLocale } = require("../config/locale.config");
const { identitySnapshotLog } = require("./identity-snapshot.log");

/**
 * @param {import('http').IncomingMessage} req — 须已 buildRequestContext
 * @returns {object} identity_snapshot
 */
function buildIdentitySnapshot(req) {
  const ctx = req.context;
  if (!ctx) {
    throw new Error("identity_snapshot_requires_context");
  }
  const ent =
    ctx.entitlement &&
    ctx.entitlement.plan != null &&
    typeof ctx.entitlement.quota === "number" &&
    typeof ctx.entitlement.used === "number"
      ? {
          plan: ctx.entitlement.plan,
          quota: ctx.entitlement.quota,
          used: ctx.entitlement.used
        }
      : null;
  return {
    user_id: ctx.userId,
    market: ctx.market,
    locale: ctx.locale,
    product: ctx.product,
    client_platform: ctx.platform,
    entitlement: ent,
    session_version: preferencesSync.getCurrentSessionVersion(ctx.userId),
    captured_at: new Date().toISOString()
  };
}

/**
 * @param {object} snapshot
 * @param {{ allowNullEntitlement?: boolean, task_id?: string }} [opts]
 * @returns {{ ok: true } | { ok: false }}
 */
function assertIdentitySnapshot(snapshot, opts) {
  const s = snapshot || {};
  const allowNullEnt = opts && opts.allowNullEntitlement;
  const taskIdForLog = opts && opts.task_id;

  let ok =
    s.user_id &&
    String(s.user_id).trim() &&
    isValidMarket(s.market) &&
    isValidLocale(s.locale) &&
    s.product &&
    String(s.product).trim() &&
    s.client_platform &&
    String(s.client_platform).trim() &&
    Number.isInteger(s.session_version) &&
    s.session_version >= 1 &&
    s.captured_at &&
    String(s.captured_at).trim();

  if (ok && s.entitlement != null) {
    const e = s.entitlement;
    ok =
      e.plan != null &&
      String(e.plan).trim() !== "" &&
      typeof e.quota === "number" &&
      typeof e.used === "number";
  }
  if (ok && s.entitlement == null && !allowNullEnt) {
    ok = false;
  }

  if (!ok) {
    identitySnapshotLog({
      event: "identity_snapshot_invalid",
      task_id: taskIdForLog,
      user_id: s.user_id || null,
      market: s.market || null,
      locale: s.locale || null,
      product: s.product || null,
      client_platform: s.client_platform || null,
      session_version: s.session_version
    });
    return { ok: false };
  }
  return { ok: true };
}

module.exports = { buildIdentitySnapshot, assertIdentitySnapshot };
