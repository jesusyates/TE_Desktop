/**
 * 审计事件：create / listByUser — JSONL + Supabase + dual_write
 */
const fs = require("fs");
const path = require("path");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const auditAdapter = require("../../infra/supabase/adapters/audit.adapter");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { normalizeAuditEventRecord } = require("../../schemas/audit-event.schema");

/**
 * @param {object} data — 已含 auditId, userId, eventType, payload, market, locale, product, createdAt
 */
function toRow(data) {
  const ts = data.createdAt || new Date().toISOString();
  return {
    id: String(data.auditId || "").trim(),
    user_id: String(data.userId || "").trim(),
    event_type: String(data.eventType || "").trim(),
    payload: data.payload && typeof data.payload === "object" ? data.payload : {},
    market: data.market != null ? String(data.market) : "global",
    locale: data.locale != null ? String(data.locale) : "en-US",
    product: data.product != null ? String(data.product) : "aics",
    created_at: ts
  };
}

function rowToApi(r) {
  return normalizeAuditEventRecord({
    auditId: r.id,
    userId: r.user_id,
    eventType: r.event_type,
    payload: r.payload,
    createdAt: r.created_at,
    market: r.market,
    locale: r.locale,
    product: r.product
  });
}

class MemoryAuditStore {
  constructor() {
    /** @type {object[]} */
    this.rows = [];
  }

  async create(data, _requestId = null) {
    const line = toRow(data);
    this.rows.push(line);
    const api = rowToApi(line);
    if (!api) throw new Error("audit_normalize_failed");
    return api;
  }

  async listByUser(userId, limit = 50, _requestId = null) {
    const uid = String(userId || "").trim();
    const lim = Math.min(200, Math.max(1, limit || 50));
    return this.rows
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, lim)
      .map((r) => rowToApi(r))
      .filter(Boolean);
  }
}

class LocalJsonlAuditStore {
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
    const api = rowToApi(line);
    if (!api) throw new Error("audit_normalize_failed");
    return api;
  }

  async listByUser(userId, limit = 50, _requestId = null) {
    const uid = String(userId || "").trim();
    const lim = Math.min(200, Math.max(1, limit || 50));
    return this._readAll()
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, lim)
      .map((r) => rowToApi(r))
      .filter(Boolean);
  }
}

class SupabaseAuditStore {
  async create(data, _requestId = null) {
    const line = toRow(data);
    await auditAdapter.insertRow(line);
    const api = rowToApi(line);
    if (!api) throw new Error("audit_normalize_failed");
    return api;
  }

  async listByUser(userId, limit = 50, _requestId = null) {
    const uid = String(userId || "").trim();
    const lim = Math.min(200, Math.max(1, limit || 50));
    const data = await auditAdapter.listByUserId(uid, lim);
    return (data || []).map((d) => rowToApi(d)).filter(Boolean);
  }
}

class DualWriteAuditStore {
  /**
   * @param {LocalJsonlAuditStore} localStore
   * @param {SupabaseAuditStore} cloudStore
   */
  constructor(localStore, cloudStore) {
    this.local = localStore;
    this.cloud = cloudStore;
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
      entity: "audit",
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
        entity: "audit",
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
function createAuditStore(mode, baseDir) {
  const m = (mode || "").toLowerCase();
  const filePath = path.join(baseDir, "audit-events.jsonl");
  if (m === "memory") return new MemoryAuditStore();
  const local = new LocalJsonlAuditStore(filePath);
  const cloud = new SupabaseAuditStore();
  if (m === "local_only") return local;
  if (m === "cloud_primary") {
    if (!isSupabaseConfigured()) return local;
    return cloud;
  }
  if (m === "dual_write") {
    if (!isSupabaseConfigured()) return local;
    return new DualWriteAuditStore(local, cloud);
  }
  return local;
}

module.exports = {
  createAuditStore,
  MemoryAuditStore,
  LocalJsonlAuditStore,
  SupabaseAuditStore,
  DualWriteAuditStore
};
