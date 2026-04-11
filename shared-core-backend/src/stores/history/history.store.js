/**
 * History 摘要：JSONL + Supabase + dual_write。
 */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const historyAdapter = require("../../infra/supabase/adapters/history.adapter");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { normalizeHistoryRecord } = require("../../schemas/history.schema");

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
  const id =
    data.historyId != null && String(data.historyId).trim() !== ""
      ? String(data.historyId).trim()
      : existing && existing.id
        ? existing.id
        : `hist_${randomUUID()}`;
  return {
    id,
    task_id:
      data.taskId != null
        ? String(data.taskId).trim()
        : existing && existing.task_id
          ? existing.task_id
          : "",
    run_id:
      data.runId != null
        ? String(data.runId).trim()
        : existing && existing.run_id
          ? existing.run_id
          : "",
    user_id:
      data.userId != null
        ? String(data.userId).trim()
        : existing && existing.user_id
          ? existing.user_id
          : "",
    prompt: data.prompt != null ? String(data.prompt) : existing ? existing.prompt || "" : "",
    status: data.status != null ? String(data.status) : existing ? existing.status : "success",
    result_source_type:
      data.resultSourceType != null
        ? String(data.resultSourceType)
        : existing && existing.result_source_type
          ? String(existing.result_source_type)
          : "mock",
    summary: data.summary != null ? String(data.summary) : existing ? existing.summary || "" : "",
    market: dim.market,
    locale: dim.locale,
    product: dim.product,
    created_at: data.createdAt || (existing && existing.created_at) || ts,
    updated_at: data.updatedAt != null ? String(data.updatedAt) : ts
  };
}

function toApi(row) {
  return normalizeHistoryRecord({
    historyId: row.id,
    task_id: row.task_id,
    run_id: row.run_id,
    user_id: row.user_id,
    prompt: row.prompt,
    status: row.status,
    result_source_type: row.result_source_type,
    summary: row.summary,
    market: row.market,
    locale: row.locale,
    product: row.product,
    created_at: row.created_at,
    updated_at: row.updated_at
  });
}

class MemoryHistoryStore {
  constructor() {
    /** @type {object[]} */
    this.rows = [];
  }

  async getById(historyId, _requestId = null) {
    const row = this.rows.find((r) => r.id === historyId);
    return row ? toApi(row) : null;
  }

  async listByUser(userId, opts = {}, _requestId = null) {
    const page = Math.max(1, parseInt(String(opts.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(opts.limit || opts.pageSize || "20"), 10) || 20));
    const uid = String(userId || "").trim();
    const all = this.rows
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const total = all.length;
    const slice = all.slice((page - 1) * limit, page * limit);
    return {
      items: slice.map((r) => toApi(r)),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    };
  }

  async create(data, _rid = null) {
    const line = toRow(data, null);
    this.rows.push(line);
    return toApi(line);
  }

  async update(data, _rid = null) {
    const hid = String(data.historyId || "").trim();
    const idx = this.rows.findIndex((r) => r.id === hid);
    if (idx < 0) return null;
    const merged = toRow(data, this.rows[idx]);
    this.rows[idx] = merged;
    return toApi(merged);
  }

  async deleteById(historyId, userId, _rid = null) {
    const uid = String(userId || "").trim();
    const idx = this.rows.findIndex((r) => r.id === historyId && r.user_id === uid);
    if (idx < 0) return false;
    this.rows.splice(idx, 1);
    return true;
  }
}

class LocalJsonlHistoryStore {
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

  async getById(historyId, _requestId = null) {
    const row = this._read().find((r) => r.id === historyId);
    return row ? toApi(row) : null;
  }

  async listByUser(userId, opts = {}, _requestId = null) {
    const page = Math.max(1, parseInt(String(opts.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(opts.limit || opts.pageSize || "20"), 10) || 20));
    const uid = String(userId || "").trim();
    const all = this._read()
      .filter((r) => r.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const total = all.length;
    const slice = all.slice((page - 1) * limit, page * limit);
    return {
      items: slice.map((r) => toApi(r)),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    };
  }

  async create(data, _rid = null) {
    const line = toRow(data, null);
    const rows = this._read();
    rows.push(line);
    this._write(rows);
    return toApi(line);
  }

  async update(data, _rid = null) {
    const hid = String(data.historyId || "").trim();
    const rows = this._read();
    const idx = rows.findIndex((r) => r.id === hid);
    if (idx < 0) return null;
    const merged = toRow(data, rows[idx]);
    rows[idx] = merged;
    this._write(rows);
    return toApi(merged);
  }

  async deleteById(historyId, userId, _rid = null) {
    const uid = String(userId || "").trim();
    const rows = this._read();
    const next = rows.filter((r) => !(r.id === historyId && r.user_id === uid));
    if (next.length === rows.length) return false;
    this._write(next);
    return true;
  }
}

class SupabaseHistoryStore {
  _mapDb(d) {
    if (!d) return null;
    return toApi({
      id: d.id,
      task_id: d.task_id,
      run_id: d.run_id,
      user_id: d.user_id,
      prompt: d.prompt,
      status: d.status,
      result_source_type: d.result_source_type,
      summary: d.summary,
      market: d.market,
      locale: d.locale,
      product: d.product,
      created_at: d.created_at,
      updated_at: d.updated_at
    });
  }

  async getById(historyId, _requestId = null) {
    const d = await historyAdapter.selectById(historyId);
    return this._mapDb(d);
  }

  async listByUser(userId, opts = {}, _requestId = null) {
    const page = Math.max(1, parseInt(String(opts.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(opts.limit || opts.pageSize || "20"), 10) || 20));
    const offset = (page - 1) * limit;
    const [data, total] = await Promise.all([
      historyAdapter.listByUserId(userId, limit, offset),
      historyAdapter.countByUserId(userId)
    ]);
    const items = (data || []).map((d) => this._mapDb(d)).filter(Boolean);
    return {
      items,
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    };
  }

  async create(data, _rid = null) {
    const line = toRow(data, null);
    await historyAdapter.insertRow(line);
    return toApi(line);
  }

  async update(data, _rid = null) {
    const hid = String(data.historyId || "").trim();
    const userId = String(data.userId || "").trim();
    if (!hid || !userId) return null;
    const ex = await historyAdapter.selectById(hid);
    if (!ex) return null;
    const merged = toRow(data, ex);
    const patch = {
      prompt: merged.prompt,
      status: merged.status,
      result_source_type: merged.result_source_type,
      summary: merged.summary,
      market: merged.market,
      locale: merged.locale,
      product: merged.product,
      updated_at: merged.updated_at
    };
    const out = await historyAdapter.updateRow(hid, userId, patch);
    return this._mapDb(out);
  }

  async deleteById(historyId, userId, _rid = null) {
    return historyAdapter.deleteRow(historyId, userId);
  }
}

class DualWriteHistoryStore {
  constructor(localStore, cloudStore) {
    this.local = localStore;
    this.cloud = cloudStore;
  }

  async getById(historyId, requestId = null) {
    try {
      const row = await this.cloud.getById(historyId);
      if (row) return row;
    } catch (e) {
      logStorageDiff({
        userId: null,
        entity: "history",
        operation: "read",
        cloudSuccess: false,
        error: e,
        requestId
      });
    }
    return this.local.getById(historyId);
  }

  async listByUser(userId, opts = {}, requestId = null) {
    try {
      return await this.cloud.listByUser(userId, opts, requestId);
    } catch (e) {
      logStorageDiff({
        userId,
        entity: "history",
        operation: "read",
        cloudSuccess: false,
        error: e,
        requestId
      });
      return this.local.listByUser(userId, opts);
    }
  }

  async create(data, requestId = null) {
    const uid = data.userId != null ? String(data.userId) : null;
    const [lr, cr] = await Promise.allSettled([this.local.create(data), this.cloud.create(data)]);
    logStorageDiff({
      userId: uid,
      entity: "history",
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
      entity: "history",
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

  async deleteById(historyId, userId, requestId = null) {
    const [lr, cr] = await Promise.allSettled([
      this.local.deleteById(historyId, userId),
      this.cloud.deleteById(historyId, userId)
    ]);
    logStorageDiff({
      userId,
      entity: "history",
      operation: "delete",
      localSuccess: lr.status === "fulfilled" && lr.value === true,
      cloudSuccess: cr.status === "fulfilled" && cr.value === true,
      error:
        lr.status === "rejected"
          ? lr.reason
          : cr.status === "rejected"
            ? cr.reason
            : null,
      requestId
    });
    if (lr.status === "rejected") throw lr.reason instanceof Error ? lr.reason : new Error(String(lr.reason));
    return Boolean(lr.value);
  }
}

function createHistoryStore(mode, filePath) {
  const m = (mode || "").toLowerCase();
  if (m === "memory") return new MemoryHistoryStore();
  const local = new LocalJsonlHistoryStore(filePath);
  const cloud = new SupabaseHistoryStore();
  if (m === "local_only") return local;
  if (m === "cloud_primary") {
    if (!isSupabaseConfigured()) return local;
    return cloud;
  }
  if (m === "dual_write") {
    if (!isSupabaseConfigured()) return local;
    return new DualWriteHistoryStore(local, cloud);
  }
  return local;
}

module.exports = {
  createHistoryStore,
  MemoryHistoryStore,
  LocalJsonlHistoryStore,
  SupabaseHistoryStore,
  DualWriteHistoryStore
};
