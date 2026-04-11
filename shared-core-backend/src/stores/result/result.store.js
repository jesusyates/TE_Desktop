/**
 * Result 快照：id = run_id；JSONL + Supabase + dual_write。
 */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const resultAdapter = require("../../infra/supabase/adapters/result.adapter");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { normalizeResultRecord } = require("../../schemas/result.schema");

function nowIso() {
  return new Date().toISOString();
}

function mergeDims(data, existing) {
  const ex = existing || {};
  return {
    market:
      data.market != null
        ? String(data.market)
        : ex.market != null
          ? String(ex.market)
          : "global",
    locale:
      data.locale != null
        ? String(data.locale)
        : ex.locale != null
          ? String(ex.locale)
          : "en-US",
    product:
      data.product != null
        ? String(data.product)
        : ex.product != null
          ? String(ex.product)
          : "aics"
  };
}

function toRow(data, existing = null) {
  const ts = nowIso();
  const dim = mergeDims(data, existing);
  const runId =
    data.runId != null && String(data.runId).trim() !== ""
      ? String(data.runId).trim()
      : existing && existing.id
        ? existing.id
        : `run_${randomUUID()}`;
  const success =
    data.success !== undefined
      ? Boolean(data.success)
      : existing && existing.success !== undefined
        ? Boolean(existing.success)
        : true;
  return {
    id: runId,
    task_id:
      data.taskId != null
        ? String(data.taskId).trim()
        : existing && existing.task_id
          ? existing.task_id
          : "",
    user_id:
      data.userId != null
        ? String(data.userId).trim()
        : existing && existing.user_id
          ? existing.user_id
          : "",
    result: data.result !== undefined ? data.result : existing ? existing.result : {},
    result_source_type:
      data.resultSourceType != null
        ? String(data.resultSourceType)
        : existing && existing.result_source_type
          ? String(existing.result_source_type)
          : "mock",
    success,
    market: dim.market,
    locale: dim.locale,
    product: dim.product,
    created_at: data.createdAt || (existing && existing.created_at) || ts,
    updated_at: data.updatedAt != null ? String(data.updatedAt) : ts
  };
}

function toApi(row) {
  return normalizeResultRecord({
    runId: row.id,
    task_id: row.task_id,
    user_id: row.user_id,
    result: row.result,
    result_source_type: row.result_source_type,
    success: row.success,
    market: row.market,
    locale: row.locale,
    product: row.product,
    created_at: row.created_at,
    updated_at: row.updated_at
  });
}

class MemoryResultStore {
  constructor() {
    /** @type {object[]} */
    this.rows = [];
  }

  async getByRunId(runId, _requestId = null) {
    const row = this.rows.find((r) => r.id === runId);
    return row ? toApi(row) : null;
  }

  async listByUser(userId, _requestId = null) {
    const uid = String(userId || "").trim();
    return this.rows
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((r) => toApi(r));
  }

  async create(data, _rid = null) {
    const line = toRow(data, null);
    this.rows.push(line);
    return toApi(line);
  }

  async update(data, _rid = null) {
    const runId = String(data.runId || data.id || "").trim();
    const idx = this.rows.findIndex((r) => r.id === runId);
    if (idx < 0) return null;
    const merged = toRow(data, this.rows[idx]);
    this.rows[idx] = merged;
    return toApi(merged);
  }
}

class LocalJsonlResultStore {
  constructor(filePath) {
    this.filePath = filePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "", "utf8");
  }

  _read() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  _write(rows) {
    fs.writeFileSync(
      this.filePath,
      rows.length ? rows.map((r) => JSON.stringify(r)).join("\n") + "\n" : "",
      "utf8"
    );
  }

  async getByRunId(runId, _requestId = null) {
    const row = this._read().find((r) => r.id === runId);
    return row ? toApi(row) : null;
  }

  async listByUser(userId, _requestId = null) {
    const uid = String(userId || "").trim();
    return this._read()
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((r) => toApi(r));
  }

  async create(data, _rid = null) {
    const line = toRow(data, null);
    const rows = this._read();
    rows.push(line);
    this._write(rows);
    return toApi(line);
  }

  async update(data, _rid = null) {
    const runId = String(data.runId || "").trim();
    const rows = this._read();
    const idx = rows.findIndex((r) => r.id === runId);
    if (idx < 0) return null;
    const merged = toRow(data, rows[idx]);
    rows[idx] = merged;
    this._write(rows);
    return toApi(merged);
  }
}

class SupabaseResultStore {
  _mapDb(d) {
    if (!d) return null;
    return toApi({
      id: d.id,
      task_id: d.task_id,
      user_id: d.user_id,
      result: d.result,
      result_source_type: d.result_source_type,
      success: d.success,
      market: d.market,
      locale: d.locale,
      product: d.product,
      created_at: d.created_at,
      updated_at: d.updated_at
    });
  }

  async getByRunId(runId, _requestId = null) {
    const d = await resultAdapter.selectByRunId(runId);
    return this._mapDb(d);
  }

  async listByUser(userId, limit = 200, _requestId = null) {
    const data = await resultAdapter.listByUserId(userId, limit);
    return (data || []).map((d) => this._mapDb(d)).filter(Boolean);
  }

  async create(data, _rid = null) {
    const line = toRow(data, null);
    await resultAdapter.insertRow(line);
    return toApi(line);
  }

  async update(data, _rid = null) {
    const runId = String(data.runId || "").trim();
    const userId = String(data.userId || "").trim();
    if (!runId || !userId) return null;
    const ex = await resultAdapter.selectByRunId(runId);
    if (!ex) return null;
    const merged = toRow(data, ex);
    const patch = {
      result: merged.result,
      result_source_type: merged.result_source_type,
      success: merged.success,
      market: merged.market,
      locale: merged.locale,
      product: merged.product,
      updated_at: merged.updated_at
    };
    const out = await resultAdapter.updateRow(runId, userId, patch);
    return this._mapDb(out);
  }
}

class DualWriteResultStore {
  constructor(localStore, cloudStore) {
    this.local = localStore;
    this.cloud = cloudStore;
  }

  async getByRunId(runId, requestId = null) {
    try {
      const row = await this.cloud.getByRunId(runId);
      if (row) return row;
    } catch (e) {
      logStorageDiff({
        userId: null,
        entity: "result",
        operation: "read",
        cloudSuccess: false,
        error: e,
        requestId
      });
    }
    return this.local.getByRunId(runId);
  }

  async listByUser(userId, requestId = null) {
    try {
      return await this.cloud.listByUser(userId, 200, requestId);
    } catch (e) {
      logStorageDiff({
        userId,
        entity: "result",
        operation: "read",
        cloudSuccess: false,
        error: e,
        requestId
      });
      return this.local.listByUser(userId);
    }
  }

  async create(data, requestId = null) {
    const uid = data.userId != null ? String(data.userId) : null;
    const [lr, cr] = await Promise.allSettled([this.local.create(data), this.cloud.create(data)]);
    logStorageDiff({
      userId: uid,
      entity: "result",
      operation: "create",
      localSuccess: lr.status === "fulfilled",
      cloudSuccess: cr.status === "fulfilled",
      error: lr.status === "rejected" ? lr.reason : cr.status === "rejected" ? cr.reason : null,
      requestId
    });
    if (lr.status === "rejected") throw lr.reason instanceof Error ? lr.reason : new Error(String(lr.reason));
    return lr.value;
  }

  async update(data, requestId = null) {
    const uid = data.userId != null ? String(data.userId) : null;
    const [lr, cr] = await Promise.allSettled([this.local.update(data), this.cloud.update(data)]);
    logStorageDiff({
      userId: uid,
      entity: "result",
      operation: "update",
      localSuccess: lr.status === "fulfilled" && lr.value != null,
      cloudSuccess: cr.status === "fulfilled" && cr.value != null,
      error:
        lr.status === "rejected"
          ? lr.reason
          : cr.status === "rejected"
            ? cr.reason
            : null,
      requestId
    });
    if (lr.status === "rejected") throw lr.reason instanceof Error ? lr.reason : new Error(String(lr.reason));
    return lr.value;
  }
}

function createResultStore(mode, filePath) {
  const m = (mode || "").toLowerCase();
  if (m === "memory") return new MemoryResultStore();
  const local = new LocalJsonlResultStore(filePath);
  const cloud = new SupabaseResultStore();
  if (m === "local_only") return local;
  if (m === "cloud_primary") {
    if (!isSupabaseConfigured()) return local;
    return cloud;
  }
  if (m === "dual_write") {
    if (!isSupabaseConfigured()) return local;
    return new DualWriteResultStore(local, cloud);
  }
  return local;
}

module.exports = {
  createResultStore,
  MemoryResultStore,
  LocalJsonlResultStore,
  SupabaseResultStore,
  DualWriteResultStore
};
