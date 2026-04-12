/**
 * 计费摘要存储：本地 authoritative（billing/entitlement.store）；云 v1_entitlements 镜像。
 */
const { config } = require("../../infra/config");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const coreEntitlementStore = require("../../../billing/entitlement.store");
const entitlementAdapter = require("../../infra/supabase/adapters/entitlement.adapter");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");

function normalizeRow(r) {
  if (!r) return null;
  return {
    user_id: r.user_id,
    product: r.product,
    plan: r.plan,
    quota: Number(r.quota),
    used: Number(r.used),
    status: r.status,
    created_at: r.created_at != null ? String(r.created_at) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null
  };
}

/**
 * 云镜像 / 历史行常见缺口：status 大小写、quota/used 为 null → Number成 0 导致「永远额度用尽」。
 * 仅修正内存返回，不写回 DB；显式 plan none/blocked 不抬 quota。
 */
function sanitizeEntitlementRecord(n) {
  if (!n || typeof n !== "object") return n;
  const cfg = config();
  const defaultQ =
    Number.isFinite(Number(cfg.quotaDefaultTokens)) && Number(cfg.quotaDefaultTokens) > 0
      ? Number(cfg.quotaDefaultTokens)
      : 100_000;
  const plan = String(n.plan ?? "free").trim().toLowerCase() || "free";
  let status;
  if (n.status == null || String(n.status).trim() === "") {
    status = "active";
  } else {
    status = String(n.status).trim().toLowerCase();
  }
  let quota = Number(n.quota);
  let used = Number(n.used);
  if (!Number.isFinite(used) || used < 0) used = 0;
  const blockedPlan = plan === "none" || plan === "blocked";
  if (!Number.isFinite(quota) || quota < 1) {
    quota = blockedPlan ? 0 : defaultQ;
  }
  return {
    ...n,
    plan,
    status,
    quota,
    used
  };
}

function finalizeRow(row) {
  if (!row) return null;
  return sanitizeEntitlementRecord(row);
}

function toCloudPayload(local) {
  const now = new Date().toISOString();
  return {
    user_id: local.user_id,
    product: local.product,
    plan: local.plan,
    quota: local.quota,
    used: local.used,
    status: local.status,
    created_at: local.created_at || now,
    updated_at: local.updated_at || now
  };
}

/**
 * 将本地权威行推送到云（异步、不阻断调用方）。
 * @param {string} userId
 * @param {string} product
 * @param {string|null} [requestId]
 */
function scheduleEntitlementCloudMirror(userId, product, requestId = null) {
  const uid = userId != null ? String(userId).trim() : "";
  const prod = product != null ? String(product).trim().toLowerCase() : "";
  if (!uid || !prod) return;
  const mode = config().domainStorageMode;
  if (mode !== "dual_write" && mode !== "cloud_primary") return;
  if (!isSupabaseConfigured()) {
    logStorageDiff({
      userId: uid,
      entity: "entitlement",
      operation: "sync",
      localSuccess: true,
      cloudSuccess: false,
      error: "supabase_not_configured",
      requestId
    });
    return;
  }

  setImmediate(async () => {
    let local;
    try {
      local = coreEntitlementStore.getOrCreate(uid, prod);
    } catch (e) {
      logStorageDiff({
        userId: uid,
        entity: "entitlement",
        operation: "sync",
        localSuccess: false,
        cloudSuccess: false,
        error: e,
        requestId
      });
      return;
    }
    try {
      await entitlementAdapter.upsertRow(toCloudPayload(local));
      logStorageDiff({
        userId: uid,
        entity: "entitlement",
        operation: "sync",
        localSuccess: true,
        cloudSuccess: true,
        requestId
      });
    } catch (e) {
      logStorageDiff({
        userId: uid,
        entity: "entitlement",
        operation: "sync",
        localSuccess: true,
        cloudSuccess: false,
        error: e,
        requestId
      });
    }
  });
}

/**
 * @param {string} userId
 * @param {string} product
 * @param {string|null} [requestId]
 */
async function getForProduct(userId, product, requestId = null) {
  const uid = userId != null ? String(userId).trim() : "";
  const prod = product != null ? String(product).trim().toLowerCase() : "aics";
  if (!uid) return null;

  const mode = config().domainStorageMode;
  const localRaw = coreEntitlementStore.getOrCreate(uid, prod);
  const local = normalizeRow(localRaw);

  if (mode === "local_only" || !isSupabaseConfigured()) {
    return finalizeRow(local);
  }

  if (mode === "cloud_primary") {
    try {
      const cloud = await entitlementAdapter.fetchByUserProduct(uid, prod);
      if (cloud) {
        return finalizeRow(
          normalizeRow({
            user_id: cloud.user_id,
            product: cloud.product,
            plan: cloud.plan,
            quota: cloud.quota,
            used: cloud.used,
            status: cloud.status,
            created_at: cloud.created_at,
            updated_at: cloud.updated_at
          })
        );
      }
    } catch (e) {
      logStorageDiff({
        userId: uid,
        entity: "entitlement",
        operation: "read",
        localSuccess: true,
        cloudSuccess: false,
        error: e,
        requestId
      });
    }
    return finalizeRow(local);
  }

  /** dual_write：优先云；漂移时以本地计费为准并尝试修复云副本 */
  try {
    const cloud = await entitlementAdapter.fetchByUserProduct(uid, prod);
    if (cloud) {
      const cn = normalizeRow({
        user_id: cloud.user_id,
        product: cloud.product,
        plan: cloud.plan,
        quota: cloud.quota,
        used: cloud.used,
        status: cloud.status,
        created_at: cloud.created_at,
        updated_at: cloud.updated_at
      });
      const aligned =
        cn &&
        cn.plan === local.plan &&
        cn.status === local.status &&
        cn.quota === local.quota &&
        cn.used === local.used;
      if (aligned) return finalizeRow(cn);
      logStorageDiff({
        userId: uid,
        entity: "entitlement",
        operation: "read",
        localSuccess: true,
        cloudSuccess: true,
        error: "entitlement_cloud_drift_repair",
        requestId
      });
      try {
        await entitlementAdapter.upsertRow(toCloudPayload(localRaw));
      } catch (e) {
        logStorageDiff({
          userId: uid,
          entity: "entitlement",
          operation: "sync",
          localSuccess: true,
          cloudSuccess: false,
          error: e,
          requestId
        });
      }
      return finalizeRow(local);
    }
  } catch (e) {
    logStorageDiff({
      userId: uid,
      entity: "entitlement",
      operation: "read",
      localSuccess: true,
      cloudSuccess: false,
      error: e,
      requestId
    });
  }

  scheduleEntitlementCloudMirror(uid, prod, requestId);
  return finalizeRow(local);
}

/** @param {string} userId @param {string|null} [requestId] */
async function getById(userId, requestId) {
  const prod = config().defaultProduct || "aics";
  return getForProduct(userId, prod, requestId);
}

async function create(data, requestId) {
  const uid = data && data.userId != null ? String(data.userId).trim() : "";
  const prod =
    data && data.product != null ? String(data.product).trim().toLowerCase() : "aics";
  if (!uid) throw new Error("userId required");
  const local = normalizeRow(coreEntitlementStore.getOrCreate(uid, prod));
  scheduleEntitlementCloudMirror(uid, prod, requestId);
  return finalizeRow(local);
}

async function update(data, requestId) {
  return create(data, requestId);
}

async function listByUser(userId) {
  const prod = config().defaultProduct || "aics";
  const row = await getForProduct(userId, prod, null);
  return row ? [row] : [];
}

module.exports = {
  getById,
  getForProduct,
  create,
  update,
  listByUser,
  scheduleEntitlementCloudMirror
};
