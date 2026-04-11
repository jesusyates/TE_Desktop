/**
 * Usage 明细：create / listByUser — JSONL + Supabase + dual_write
 */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const usageAdapter = require("../../infra/supabase/adapters/usage.adapter");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { normalizeUsageRecord } = require("../../schemas/usage.schema");

function toRow(data) {
  const ts = data.createdAt || new Date().toISOString();
  return {
    id: data.usageId != null ? String(data.usageId) : `usg_${randomUUID()}`,
    user_id: String(data.userId || "").trim(),
    run_id: data.runId != null ? String(data.runId) : null,
    provider: data.provider != null ? String(data.provider) : "openai",
    model: data.model != null ? String(data.model) : "",
    input_tokens: Number(data.inputTokens) || 0,
    output_tokens: Number(data.outputTokens) || 0,
    total_tokens: Number(data.totalTokens) || 0,
    cost: data.cost != null ? Number(data.cost) : 0,
    market: data.market != null ? String(data.market) : "global",
    locale: data.locale != null ? String(data.locale) : "en-US",
    product: data.product != null ? String(data.product) : "aics",
    created_at: ts
  };
}

function rowToApi(r) {
  return normalizeUsageRecord({
    usageId: r.id,
    userId: r.user_id,
    runId: r.run_id,
    provider: r.provider,
    model: r.model,
    totalTokens: r.total_tokens,
    cost: r.cost,
    createdAt: r.created_at,
    market: r.market,
    locale: r.locale,
    product: r.product
  });
}

class MemoryUsageStore {
  constructor() {
    /** @type {object[]} */
    this.rows = [];
  }

  async create(data, requestId = null) {
    const line = toRow(data);
    this.rows.push(line);
    return rowToApi(line);
  }

  async listByUser(userId, _limit = 200, _requestId = null) {
    const uid = String(userId || "").trim();
    return this.rows
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 200)
      .map((r) => rowToApi(r));
  }
}

class LocalJsonlUsageStore {
  /** @param {string} filePath */
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

  async create(data, _requestId = null) {
    const line = toRow(data);
    const rows = this._readAll();
    rows.push(line);
    this._writeAll(rows);
    return rowToApi(line);
  }

  async listByUser(userId, limit = 200, _requestId = null) {
    const uid = String(userId || "").trim();
    const lim = Math.min(500, Math.max(1, limit || 200));
    return this._readAll()
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, lim)
      .map((r) => rowToApi(r));
  }
}

class SupabaseUsageStore {
  async create(data, _requestId = null) {
    const line = toRow(data);
    await usageAdapter.insertRow(line);
    return rowToApi(line);
  }

  async listByUser(userId, limit = 200, _requestId = null) {
    const uid = String(userId || "").trim();
    const data = await usageAdapter.listByUserId(uid, limit);
    return (data || []).map((d) => rowToApi(d));
  }
}

class DualWriteUsageStore {
  /**
   * @param {LocalJsonlUsageStore} localStore
   * @param {SupabaseUsageStore} cloudStore
   */
  constructor(localStore, cloudStore) {
    this.local = localStore;
    this.cloud = cloudStore;
  }

  _rid(ctx) {
    return ctx && ctx.requestId ? String(ctx.requestId) : null;
  }

  async create(data, requestId = null) {
    const uid = data.userId != null ? String(data.userId) : null;
    const [lr, cr] = await Promise.allSettled([
      this.local.create(data, requestId),
      this.cloud.create(data, requestId)
    ]);
    const localOk = lr.status === "fulfilled";
    const cloudOk = cr.status === "fulfilled";
    logStorageDiff({
      userId: uid,
      entity: "usage",
      operation: "create",
      localSuccess: localOk,
      cloudSuccess: cloudOk,
      error: !localOk ? lr.reason : !cloudOk ? cr.reason : null,
      requestId
    });
    if (!localOk) throw lr.reason instanceof Error ? lr.reason : new Error(String(lr.reason));
    return lr.value;
  }

  async listByUser(userId, limit, requestId = null) {
    try {
      return await this.cloud.listByUser(userId, limit);
    } catch (e) {
      logStorageDiff({
        userId,
        entity: "usage",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId
      });
      return this.local.listByUser(userId, limit);
    }
  }
}

/**
 * @param {string} mode
 * @param {string} baseDir
 */
function createUsageStore(mode, baseDir) {
  const m = (mode || "").toLowerCase();
  const filePath = path.join(baseDir, "usage-records.jsonl");
  if (m === "memory") return new MemoryUsageStore();
  const local = new LocalJsonlUsageStore(filePath);
  const cloud = new SupabaseUsageStore();
  if (m === "local_only") return local;
  if (m === "cloud_primary") {
    if (!isSupabaseConfigured()) return local;
    return cloud;
  }
  if (m === "dual_write") {
    if (!isSupabaseConfigured()) return local;
    return new DualWriteUsageStore(local, cloud);
  }
  return local;
}

module.exports = {
  createUsageStore,
  MemoryUsageStore,
  LocalJsonlUsageStore,
  SupabaseUsageStore,
  DualWriteUsageStore
};
