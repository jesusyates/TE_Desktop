/**
 * Feature flag 覆盖持久化 + resolveFlags（默认/市场/env/用户合并）
 */
const fs = require("fs");
const path = require("path");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const featureFlagAdapter = require("../../infra/supabase/adapters/featureFlag.adapter");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { userKey } = require("../../schemas/domain-stores.schema");
const { getStorageDimensions } = require("../../infra/context-dimensions");
const { config } = require("../../infra/config");
const { logger } = require("../../infra/logger");

const FLAG_KEYS = ["ai_enabled", "memory_enabled", "template_enabled"];

function sanitizeFlags(obj) {
  const o = obj && typeof obj === "object" ? obj : {};
  const out = {};
  for (const k of FLAG_KEYS) {
    if (o[k] === true || o[k] === false) out[k] = o[k];
  }
  return out;
}

function baseDefaults() {
  const c = config();
  return {
    ai_enabled: String(process.env.FEATURE_AI_ENABLED || "1").trim() !== "0",
    memory_enabled: String(process.env.FEATURE_MEMORY_ENABLED || "1").trim() !== "0",
    template_enabled: String(process.env.FEATURE_TEMPLATE_ENABLED || "1").trim() !== "0",
    ...sanitizeFlags(c.featureFlagDefaults && typeof c.featureFlagDefaults === "object" ? c.featureFlagDefaults : {})
  };
}

/** market 能力增量（结构预留，不写死业务） */
function marketDeltas(market) {
  const m = String(market || "").toLowerCase();
  const byMarket =
    config().featureFlagsByMarket && typeof config().featureFlagsByMarket === "object"
      ? config().featureFlagsByMarket[m]
      : null;
  if (byMarket && typeof byMarket === "object") return sanitizeFlags(byMarket);
  if (m === "cn") {
    return {
      /** 预留：cn 模型/能力策略由配置层扩展 */
      _market: "cn"
    };
  }
  return {};
}

class MemoryFeatureFlagStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.overrides = new Map();
  }

  async getByUser(ctx) {
    const uid = userKey(ctx);
    return sanitizeFlags(this.overrides.get(uid) || {});
  }

  async update(ctx, flags) {
    const uid = userKey(ctx);
    const next = sanitizeFlags({ ...((await this.getByUser(ctx)) || {}), ...flags });
    this.overrides.set(uid, next);
    return next;
  }

  async resolveFlags(ctx) {
    const uid = userKey(ctx);
    const dim = getStorageDimensions(ctx);
    const version = ctx && ctx.version != null ? String(ctx.version).trim() : "";
    const t0 = Date.now();
    const defaults = baseDefaults();
    const md = marketDeltas(dim.market);
    const userOv = sanitizeFlags(this.overrides.get(uid) || {});
    const merged = { ...defaults, ...md, ...userOv };
    for (const k of Object.keys(merged)) {
      if (k.startsWith("_")) delete merged[k];
    }
    logger.info({
      event: "feature_flag_evaluated",
      userId: uid,
      market: dim.market,
      version: version || null,
      durationMs: Date.now() - t0,
      flags: merged
    });
    return merged;
  }
}

class LocalJsonlFeatureFlagStore {
  constructor(filePath) {
    this.filePath = filePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "", "utf8");
  }

  _readAll() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  _writeAll(rows) {
    fs.writeFileSync(
      this.filePath,
      rows.length ? rows.map((r) => JSON.stringify(r)).join("\n") + "\n" : "",
      "utf8"
    );
  }

  async getByUser(ctx) {
    const uid = userKey(ctx);
    const row = this._readAll().find((r) => r.user_id === uid);
    return sanitizeFlags(row && row.flags ? row.flags : {});
  }

  async update(ctx, flags) {
    const uid = userKey(ctx);
    const rows = this._readAll();
    const idx = rows.findIndex((r) => r.user_id === uid);
    const prev = idx >= 0 ? sanitizeFlags(rows[idx].flags) : {};
    const next = sanitizeFlags({ ...prev, ...flags });
    const line = {
      user_id: uid,
      flags: next,
      updated_at: new Date().toISOString()
    };
    if (idx >= 0) rows[idx] = line;
    else rows.push(line);
    this._writeAll(rows);
    return next;
  }

  async resolveFlags(ctx) {
    const uid = userKey(ctx);
    const dim = getStorageDimensions(ctx);
    const version = ctx && ctx.version != null ? String(ctx.version).trim() : "";
    const t0 = Date.now();
    const defaults = baseDefaults();
    const md = marketDeltas(dim.market);
    const userOv = await this.getByUser(ctx);
    const merged = { ...defaults, ...md, ...userOv };
    for (const k of Object.keys(merged)) {
      if (k.startsWith("_")) delete merged[k];
    }
    logger.info({
      event: "feature_flag_evaluated",
      userId: uid,
      market: dim.market,
      version: version || null,
      durationMs: Date.now() - t0,
      flags: merged
    });
    return merged;
  }
}

class SupabaseFeatureFlagStore {
  async getByUser(ctx) {
    const uid = userKey(ctx);
    const data = await featureFlagAdapter.selectOverridesByUserId(uid);
    return sanitizeFlags(data && data.flags ? data.flags : {});
  }

  async update(ctx, flags) {
    const uid = userKey(ctx);
    const prev = await this.getByUser(ctx);
    const next = sanitizeFlags({ ...prev, ...flags });
    await featureFlagAdapter.upsertOverrides({
      user_id: uid,
      flags: next,
      updated_at: new Date().toISOString()
    });
    return next;
  }

  async resolveFlags(ctx) {
    const uid = userKey(ctx);
    const dim = getStorageDimensions(ctx);
    const version = ctx && ctx.version != null ? String(ctx.version).trim() : "";
    const t0 = Date.now();
    const defaults = baseDefaults();
    const md = marketDeltas(dim.market);
    const userOv = await this.getByUser(ctx);
    const merged = { ...defaults, ...md, ...userOv };
    for (const k of Object.keys(merged)) {
      if (k.startsWith("_")) delete merged[k];
    }
    logger.info({
      event: "feature_flag_evaluated",
      userId: uid,
      market: dim.market,
      version: version || null,
      durationMs: Date.now() - t0,
      flags: merged
    });
    return merged;
  }
}

class DualWriteFeatureFlagStore {
  constructor(localStore, cloudStore) {
    this.local = localStore;
    this.cloud = cloudStore;
  }

  async getByUser(ctx) {
    try {
      return await this.cloud.getByUser(ctx);
    } catch (e) {
      logStorageDiff({
        userId: userKey(ctx),
        entity: "featureFlag",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId: ctx.requestId || null
      });
      return this.local.getByUser(ctx);
    }
  }

  async update(ctx, flags) {
    const uid = userKey(ctx);
    const [lr, cr] = await Promise.allSettled([this.local.update(ctx, flags), this.cloud.update(ctx, flags)]);
    logStorageDiff({
      userId: uid,
      entity: "featureFlag",
      operation: "update",
      localSuccess: lr.status === "fulfilled",
      cloudSuccess: cr.status === "fulfilled",
      error: lr.status === "rejected" ? lr.reason : cr.status === "rejected" ? cr.reason : null,
      requestId: ctx.requestId || null
    });
    if (lr.status === "fulfilled") return lr.value;
    if (cr.status === "fulfilled") return cr.value;
    throw lr.reason;
  }

  async resolveFlags(ctx) {
    try {
      return await this.cloud.resolveFlags(ctx);
    } catch (e) {
      logStorageDiff({
        userId: userKey(ctx),
        entity: "featureFlag",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId: ctx.requestId || null
      });
      return this.local.resolveFlags(ctx);
    }
  }
}

function createFeatureFlagStore(mode, baseDir) {
  const m = (mode || "").toLowerCase();
  const filePath = path.join(baseDir, "feature-flag-overrides.jsonl");
  if (m === "memory") return new MemoryFeatureFlagStore();
  const local = new LocalJsonlFeatureFlagStore(filePath);
  const cloud = new SupabaseFeatureFlagStore();
  if (m === "local_only") return local;
  if (m === "cloud_primary") {
    if (!isSupabaseConfigured()) return local;
    return cloud;
  }
  if (m === "dual_write") {
    if (!isSupabaseConfigured()) return local;
    return new DualWriteFeatureFlagStore(local, cloud);
  }
  return local;
}

module.exports = {
  createFeatureFlagStore,
  MemoryFeatureFlagStore,
  FLAG_KEYS,
  sanitizeFlags
};
