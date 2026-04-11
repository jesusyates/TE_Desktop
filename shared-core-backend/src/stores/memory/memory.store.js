/**
 * AICS Memory 资产存储：create / listByUser / getById
 * — local JSONL、Supabase v1_memory_entries（entry_key 前缀 aics:asset:）、dual_write。
 */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { userKey } = require("../../schemas/domain-stores.schema");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const { getSupabaseAdminClient } = require("../../infra/supabase/client");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { normalizeMemoryRecord } = require("../../schemas/memory.schema");
const { getStorageDimensions } = require("../../infra/context-dimensions");

const ENTRY_PREFIX = "aics:asset:";

function nowIso() {
  return new Date().toISOString();
}

function toApiRow(internal) {
  return normalizeMemoryRecord({
    memoryId: internal.id,
    type: internal.type,
    summary: internal.summary,
    createdAt: internal.created_at,
    market: internal.market,
    locale: internal.locale,
    product: internal.product
  });
}

class MemoryMemoryAssetStore {
  constructor() {
    /** @type {object[]} */
    this.rows = [];
  }

  async create(ctx, data, requestId = null) {
    const uid = userKey(ctx);
    const dim = getStorageDimensions(ctx);
    const id =
      data.memoryId != null && String(data.memoryId).trim() !== ""
        ? String(data.memoryId).trim()
        : data.id != null && String(data.id).trim() !== ""
          ? String(data.id).trim()
          : `mem_${randomUUID()}`;
    const row = {
      id,
      user_id: uid,
      type: String(data.type || "pattern"),
      summary: String(data.summary || "").slice(0, 2000),
      prompt: String(data.prompt || "").slice(0, 8000),
      result_snapshot: data.resultSnapshot && typeof data.resultSnapshot === "object" ? data.resultSnapshot : {},
      market: data.market != null ? String(data.market) : dim.market,
      locale: data.locale != null ? String(data.locale) : dim.locale,
      product: data.product != null ? String(data.product) : dim.product,
      created_at: data.createdAt || nowIso()
    };
    this.rows.push(row);
    return toApiRow(row);
  }

  async listByUser(ctx, _requestId = null) {
    const uid = userKey(ctx);
    return this.rows
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((r) => toApiRow(r));
  }

  async getById(ctx, memoryId, _requestId = null) {
    const uid = userKey(ctx);
    const id = String(memoryId || "").trim();
    const row = this.rows.find((r) => r.id === id && r.user_id === uid);
    return row ? toApiRow(row) : null;
  }
}

class LocalJsonlMemoryAssetStore {
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

  async create(ctx, data, _requestId = null) {
    const uid = userKey(ctx);
    const dim = getStorageDimensions(ctx);
    const id =
      data.memoryId != null && String(data.memoryId).trim() !== ""
        ? String(data.memoryId).trim()
        : data.id != null && String(data.id).trim() !== ""
          ? String(data.id).trim()
          : `mem_${randomUUID()}`;
    const row = {
      id,
      user_id: uid,
      type: String(data.type || "pattern"),
      summary: String(data.summary || "").slice(0, 2000),
      prompt: String(data.prompt || "").slice(0, 8000),
      result_snapshot: data.resultSnapshot && typeof data.resultSnapshot === "object" ? data.resultSnapshot : {},
      market: data.market != null ? String(data.market) : dim.market,
      locale: data.locale != null ? String(data.locale) : dim.locale,
      product: data.product != null ? String(data.product) : dim.product,
      created_at: data.createdAt || nowIso()
    };
    const rows = this._readAll();
    rows.push(row);
    this._writeAll(rows);
    return toApiRow(row);
  }

  async listByUser(ctx, _requestId = null) {
    const uid = userKey(ctx);
    return this._readAll()
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((r) => toApiRow(r));
  }

  async getById(ctx, memoryId, _requestId = null) {
    const uid = userKey(ctx);
    const id = String(memoryId || "").trim();
    const row = this._readAll().find((r) => r.id === id && r.user_id === uid);
    return row ? toApiRow(row) : null;
  }
}

class SupabaseMemoryAssetStore {
  _c() {
    const c = getSupabaseAdminClient();
    if (!c) throw new Error("supabase_client_unavailable");
    return c;
  }

  _entryKey(id) {
    return `${ENTRY_PREFIX}${id}`;
  }

  async create(ctx, data, _requestId = null) {
    const uid = userKey(ctx);
    const dim = getStorageDimensions(ctx);
    const id =
      data.memoryId != null && String(data.memoryId).trim() !== ""
        ? String(data.memoryId).trim()
        : data.id != null && String(data.id).trim() !== ""
          ? String(data.id).trim()
          : `mem_${randomUUID()}`;
    const ts = data.createdAt || nowIso();
    const market = data.market != null ? String(data.market) : dim.market;
    const locale = data.locale != null ? String(data.locale) : dim.locale;
    const product = data.product != null ? String(data.product) : dim.product;
    const value = {
      kind: "aics_asset",
      type: String(data.type || "pattern"),
      summary: String(data.summary || "").slice(0, 2000),
      prompt: String(data.prompt || "").slice(0, 8000),
      resultSnapshot:
        data.resultSnapshot && typeof data.resultSnapshot === "object" ? data.resultSnapshot : {},
      market,
      locale,
      product
    };
    const client = this._c();
    const { error } = await client.from("v1_memory_entries").insert({
      user_id: uid,
      entry_key: this._entryKey(id),
      value,
      created_at: ts
    });
    if (error) throw new Error(error.message || "supabase_memory_asset_insert");
    return normalizeMemoryRecord({
      memoryId: id,
      type: value.type,
      summary: value.summary,
      createdAt: ts,
      market,
      locale,
      product
    });
  }

  async listByUser(ctx, _requestId = null) {
    const uid = userKey(ctx);
    const client = this._c();
    const { data, error } = await client
      .from("v1_memory_entries")
      .select("*")
      .eq("user_id", uid)
      .like("entry_key", `${ENTRY_PREFIX}%`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message || "supabase_memory_asset_list");
    return (data || []).map((r) => {
      const vid = String(r.entry_key || "").startsWith(ENTRY_PREFIX)
        ? String(r.entry_key).slice(ENTRY_PREFIX.length)
        : String(r.id);
      const v = r.value && typeof r.value === "object" ? r.value : {};
      return normalizeMemoryRecord({
        memoryId: vid,
        type: v.type || "pattern",
        summary: v.summary || "",
        createdAt: r.created_at,
        market: v.market,
        locale: v.locale,
        product: v.product
      });
    });
  }

  async getById(ctx, memoryId, _requestId = null) {
    const uid = userKey(ctx);
    const id = String(memoryId || "").trim();
    const client = this._c();
    const { data, error } = await client
      .from("v1_memory_entries")
      .select("*")
      .eq("user_id", uid)
      .eq("entry_key", this._entryKey(id))
      .maybeSingle();
    if (error) throw new Error(error.message || "supabase_memory_asset_get");
    if (!data) return null;
    const v = data.value && typeof data.value === "object" ? data.value : {};
    return normalizeMemoryRecord({
      memoryId: id,
      type: v.type || "pattern",
      summary: v.summary || "",
      createdAt: data.created_at,
      market: v.market,
      locale: v.locale,
      product: v.product
    });
  }
}

class DualWriteMemoryAssetStore {
  /**
   * @param {LocalJsonlMemoryAssetStore} localStore
   * @param {SupabaseMemoryAssetStore} cloudStore
   */
  constructor(localStore, cloudStore) {
    this.local = localStore;
    this.cloud = cloudStore;
  }

  _rid(ctx) {
    return ctx && ctx.requestId ? String(ctx.requestId) : null;
  }

  async create(ctx, data, requestId = null) {
    const rid = requestId || this._rid(ctx);
    const uid = userKey(ctx);
    const [lr, cr] = await Promise.allSettled([this.local.create(ctx, data, rid), this.cloud.create(ctx, data, rid)]);
    const localOk = lr.status === "fulfilled";
    const cloudOk = cr.status === "fulfilled";
    logStorageDiff({
      userId: uid,
      entity: "memoryAsset",
      operation: "create",
      localSuccess: localOk,
      cloudSuccess: cloudOk,
      error: !localOk ? lr.reason : !cloudOk ? cr.reason : null,
      requestId: rid
    });
    if (!localOk) throw lr.reason instanceof Error ? lr.reason : new Error(String(lr.reason));
    return lr.value;
  }

  async listByUser(ctx, requestId = null) {
    const rid = requestId || this._rid(ctx);
    const uid = userKey(ctx);
    try {
      return await this.cloud.listByUser(ctx, rid);
    } catch (e) {
      logStorageDiff({
        userId: uid,
        entity: "memoryAsset",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId: rid
      });
      return this.local.listByUser(ctx, rid);
    }
  }

  async getById(ctx, memoryId, requestId = null) {
    const rid = requestId || this._rid(ctx);
    const uid = userKey(ctx);
    try {
      const row = await this.cloud.getById(ctx, memoryId, rid);
      if (row) return row;
    } catch (e) {
      logStorageDiff({
        userId: uid,
        entity: "memoryAsset",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId: rid
      });
    }
    return this.local.getById(ctx, memoryId, rid);
  }
}

/**
 * @param {string} mode
 * @param {string} baseDir — storage/local-stores 目录
 */
function createMemoryAssetStore(mode, baseDir) {
  const m = (mode || "").toLowerCase();
  const filePath = path.join(baseDir, "memory-assets.jsonl");
  if (m === "memory") return new MemoryMemoryAssetStore();
  const local = new LocalJsonlMemoryAssetStore(filePath);
  const cloud = new SupabaseMemoryAssetStore();
  if (m === "local_only") return local;
  if (m === "cloud_primary") {
    if (!isSupabaseConfigured()) return local;
    return cloud;
  }
  if (m === "dual_write") {
    if (!isSupabaseConfigured()) return local;
    return new DualWriteMemoryAssetStore(local, cloud);
  }
  return local;
}

module.exports = {
  createMemoryAssetStore,
  MemoryMemoryAssetStore,
  LocalJsonlMemoryAssetStore,
  SupabaseMemoryAssetStore,
  DualWriteMemoryAssetStore,
  ENTRY_PREFIX
};
