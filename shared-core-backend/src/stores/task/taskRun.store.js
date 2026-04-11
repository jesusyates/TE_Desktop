/**
 * Task run：落盘含 steps / result / result_source_type / updated_at（JSONL + Supabase + dual）。
 */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const taskRunAdapter = require("../../infra/supabase/adapters/taskRun.adapter");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { normalizeRunRecord } = require("../../schemas/task-run.schema");
function mergeDim(data, existing) {
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

function nowIso() {
  return new Date().toISOString();
}

function toStorageRow(data, existing = null) {
  const ts = nowIso();
  const dim = mergeDim(data, existing);
  const id =
    data.runId != null && String(data.runId).trim() !== ""
      ? String(data.runId).trim()
      : existing && existing.id
        ? existing.id
        : `run_${randomUUID()}`;
  const stepsRaw = data.steps !== undefined ? data.steps : existing ? existing.steps : [];
  const steps = Array.isArray(stepsRaw) ? stepsRaw : [];
  const result = data.result !== undefined ? data.result : existing ? existing.result : null;
  const rst =
    data.resultSourceType != null
      ? String(data.resultSourceType)
      : existing && existing.result_source_type
        ? String(existing.result_source_type)
        : "mock";
  const templateSuggestion =
    data.templateSuggestion !== undefined
      ? data.templateSuggestion
      : existing && existing.template_suggestion !== undefined
        ? existing.template_suggestion
        : null;
  return {
    id,
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
    status:
      data.status != null
        ? String(data.status)
        : existing && existing.status
          ? existing.status
          : "pending",
    steps,
    result,
    result_source_type: rst,
    template_suggestion: templateSuggestion,
    market: dim.market,
    locale: dim.locale,
    product: dim.product,
    created_at: data.createdAt || (existing && existing.created_at) || ts,
    updated_at: data.updatedAt != null ? String(data.updatedAt) : ts
  };
}

function rowToApi(row) {
  return normalizeRunRecord(row);
}

/** SHARED_CORE_STORAGE=memory */
class MemoryTaskRunStore {
  constructor() {
    /** @type {object[]} */
    this.rows = [];
  }

  async getById(runId) {
    const row = this.rows.find((r) => r.id === runId);
    return row ? rowToApi(row) : null;
  }

  async listByUser(userId) {
    const uid = String(userId || "").trim();
    return this.rows.filter((r) => r.user_id === uid).map((r) => rowToApi(r));
  }

  async create(data, _requestId = null) {
    const line = toStorageRow(data, null);
    this.rows.push(line);
    return rowToApi(line);
  }

  async update(data, _requestId = null) {
    const runId = String(data.runId || "").trim();
    const idx = this.rows.findIndex((r) => r.id === runId);
    if (idx < 0) return null;
    const merged = toStorageRow(data, this.rows[idx]);
    this.rows[idx] = merged;
    return rowToApi(merged);
  }
}

class LocalJsonlTaskRunStore {
  /** @param {string} filePath */
  constructor(filePath) {
    this.filePath = filePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "", "utf8");
  }

  _readRows() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  _writeRows(rows) {
    fs.writeFileSync(
      this.filePath,
      rows.length ? rows.map((r) => JSON.stringify(r)).join("\n") + "\n" : "",
      "utf8"
    );
  }

  async getById(runId) {
    const row = this._readRows().find((r) => r.id === runId);
    return row ? rowToApi(row) : null;
  }

  async listByUser(userId) {
    const uid = String(userId || "").trim();
    return this._readRows()
      .filter((r) => r.user_id === uid)
      .map((r) => rowToApi(r));
  }

  async create(data, _requestId = null) {
    const line = toStorageRow(data, null);
    const rows = this._readRows();
    rows.push(line);
    this._writeRows(rows);
    return rowToApi(line);
  }

  async update(data, _requestId = null) {
    const runId = String(data.runId || "").trim();
    if (!runId) return null;
    const rows = this._readRows();
    const idx = rows.findIndex((r) => r.id === runId);
    if (idx < 0) return null;
    const merged = toStorageRow(data, rows[idx]);
    rows[idx] = merged;
    this._writeRows(rows);
    return rowToApi(merged);
  }
}

class SupabaseTaskRunStore {
  _toInsert(row) {
    return {
      id: row.id,
      task_id: row.task_id,
      user_id: row.user_id,
      status: row.status,
      steps: row.steps,
      result: row.result,
      result_source_type: row.result_source_type,
      template_suggestion: row.template_suggestion != null ? row.template_suggestion : null,
      market: row.market,
      locale: row.locale,
      product: row.product,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  async getById(runId) {
    const data = await taskRunAdapter.selectById(runId);
    if (!data) return null;
    return rowToApi({
      id: data.id,
      task_id: data.task_id,
      user_id: data.user_id,
      status: data.status,
      steps: data.steps,
      result: data.result,
      result_source_type: data.result_source_type,
      template_suggestion: data.template_suggestion,
      market: data.market,
      locale: data.locale,
      product: data.product,
      created_at: data.created_at,
      updated_at: data.updated_at != null ? data.updated_at : data.created_at
    });
  }

  async listByUser(userId) {
    const uid = String(userId || "").trim();
    const data = await taskRunAdapter.listByUserId(uid);
    return (data || []).map((d) =>
      rowToApi({
        id: d.id,
        task_id: d.task_id,
        user_id: d.user_id,
        status: d.status,
        steps: d.steps,
        result: d.result,
        result_source_type: d.result_source_type,
        template_suggestion: d.template_suggestion,
        market: d.market,
        locale: d.locale,
        product: d.product,
        created_at: d.created_at,
        updated_at: d.updated_at != null ? d.updated_at : d.created_at
      })
    );
  }

  async create(data, _requestId = null) {
    const line = toStorageRow(data, null);
    await taskRunAdapter.insertRow(this._toInsert(line));
    return rowToApi(line);
  }

  async update(data, _requestId = null) {
    const runId = String(data.runId || "").trim();
    const userId = String(data.userId || "").trim();
    if (!runId || !userId) return null;
    const existing = await taskRunAdapter.selectById(runId);
    if (!existing) return null;
    const merged = toStorageRow(data, {
      id: existing.id,
      task_id: existing.task_id,
      user_id: existing.user_id,
      status: existing.status,
      steps: existing.steps,
      result: existing.result,
      result_source_type: existing.result_source_type,
      template_suggestion: existing.template_suggestion,
      market: existing.market,
      locale: existing.locale,
      product: existing.product,
      created_at: existing.created_at,
      updated_at: existing.updated_at
    });
    const patch = {
      status: merged.status,
      steps: merged.steps,
      result: merged.result,
      result_source_type: merged.result_source_type,
      template_suggestion: merged.template_suggestion,
      market: merged.market,
      locale: merged.locale,
      product: merged.product,
      updated_at: merged.updated_at
    };
    const out = await taskRunAdapter.updateRow(runId, userId, patch);
    if (!out) return null;
    return rowToApi({
      id: out.id,
      task_id: out.task_id,
      user_id: out.user_id,
      status: out.status,
      steps: out.steps,
      result: out.result,
      result_source_type: out.result_source_type,
      template_suggestion: out.template_suggestion,
      market: out.market,
      locale: out.locale,
      product: out.product,
      created_at: out.created_at,
      updated_at: out.updated_at
    });
  }
}

class DualWriteTaskRunStore {
  /**
   * @param {LocalJsonlTaskRunStore} localStore
   * @param {SupabaseTaskRunStore} cloudStore
   */
  constructor(localStore, cloudStore) {
    this.local = localStore;
    this.cloud = cloudStore;
  }

  async getById(runId, requestId = null) {
    try {
      const row = await this.cloud.getById(runId);
      if (row) return row;
    } catch (e) {
      logStorageDiff({
        userId: null,
        entity: "taskRun",
        operation: "read",
        cloudSuccess: false,
        error: e,
        requestId
      });
    }
    return this.local.getById(runId);
  }

  async listByUser(userId, requestId = null) {
    try {
      return await this.cloud.listByUser(userId);
    } catch (e) {
      logStorageDiff({
        userId,
        entity: "taskRun",
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
    const localOk = lr.status === "fulfilled";
    const cloudOk = cr.status === "fulfilled";
    logStorageDiff({
      userId: uid,
      entity: "taskRun",
      operation: "create",
      localSuccess: localOk,
      cloudSuccess: cloudOk,
      error: !localOk ? lr.reason : !cloudOk ? cr.reason : null,
      requestId
    });
    if (!localOk) throw lr.reason instanceof Error ? lr.reason : new Error(String(lr.reason));
    return lr.value;
  }

  async update(data, requestId = null) {
    const uid = data.userId != null ? String(data.userId) : null;
    const [lr, cr] = await Promise.allSettled([this.local.update(data), this.cloud.update(data)]);
    logStorageDiff({
      userId: uid,
      entity: "taskRun",
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

/**
 * @param {string} mode — local_only | dual_write | cloud_primary | memory
 * @param {string} filePath
 */
function createTaskRunStore(mode, filePath) {
  const m = (mode || "").toLowerCase();
  if (m === "memory") return new MemoryTaskRunStore();
  const local = new LocalJsonlTaskRunStore(filePath);
  const cloud = new SupabaseTaskRunStore();
  if (m === "local_only") return local;
  if (m === "cloud_primary") {
    if (!isSupabaseConfigured()) return local;
    return cloud;
  }
  if (m === "dual_write") {
    if (!isSupabaseConfigured()) return local;
    return new DualWriteTaskRunStore(local, cloud);
  }
  return local;
}

module.exports = {
  createTaskRunStore,
  MemoryTaskRunStore,
  LocalJsonlTaskRunStore,
  SupabaseTaskRunStore,
  DualWriteTaskRunStore
};
