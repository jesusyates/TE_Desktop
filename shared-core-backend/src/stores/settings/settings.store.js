/**
 * 用户 Settings：getByUser / update — JSONL + Supabase + dual_write
 */
const fs = require("fs");
const path = require("path");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const settingsAdapter = require("../../infra/supabase/adapters/settings.adapter");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { userKey } = require("../../schemas/domain-stores.schema");
const { normalizeSettingsRecord } = require("../../schemas/settings.schema");

function toRow(userId, norm) {
  const ts = norm.updatedAt || new Date().toISOString();
  return {
    user_id: String(userId).trim(),
    default_model: norm.defaultModel,
    auto_write_memory: Boolean(norm.autoWriteMemory),
    allow_ai: Boolean(norm.allowAI),
    preferred_language: norm.preferredLanguage,
    updated_at: ts
  };
}

class MemorySettingsStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.map = new Map();
  }

  async getByUser(ctx) {
    const uid = userKey(ctx);
    const raw = this.map.get(uid);
    return normalizeSettingsRecord(raw, uid);
  }

  async update(ctx, norm) {
    const uid = userKey(ctx);
    const prev = this.map.get(uid) || null;
    const merged = normalizeSettingsRecord({ ...prev, ...norm, userId: uid }, uid);
    this.map.set(uid, merged);
    return merged;
  }
}

class LocalJsonlSettingsStore {
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
    return normalizeSettingsRecord(row, uid);
  }

  async update(ctx, norm) {
    const uid = userKey(ctx);
    const rows = this._readAll();
    const idx = rows.findIndex((r) => r.user_id === uid);
    const prev = idx >= 0 ? normalizeSettingsRecord(rows[idx], uid) : normalizeSettingsRecord(null, uid);
    const merged = normalizeSettingsRecord({ ...prev, ...norm }, uid);
    const line = toRow(uid, merged);
    if (idx >= 0) rows[idx] = line;
    else rows.push(line);
    this._writeAll(rows);
    return merged;
  }
}

class SupabaseSettingsStore {
  async getByUser(ctx) {
    const uid = userKey(ctx);
    const data = await settingsAdapter.selectByUserId(uid);
    return normalizeSettingsRecord(data, uid);
  }

  async update(ctx, norm) {
    const uid = userKey(ctx);
    const prev = await this.getByUser(ctx);
    const merged = normalizeSettingsRecord({ ...prev, ...norm }, uid);
    const row = toRow(uid, merged);
    await settingsAdapter.upsertRow(row);
    return merged;
  }
}

class DualWriteSettingsStore {
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
        entity: "settings",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId: ctx.requestId || null
      });
      return this.local.getByUser(ctx);
    }
  }

  async update(ctx, norm) {
    const uid = userKey(ctx);
    const [lr, cr] = await Promise.allSettled([this.local.update(ctx, norm), this.cloud.update(ctx, norm)]);
    logStorageDiff({
      userId: uid,
      entity: "settings",
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
}

function createSettingsStore(mode, baseDir) {
  const m = (mode || "").toLowerCase();
  const filePath = path.join(baseDir, "user-settings.jsonl");
  if (m === "memory") return new MemorySettingsStore();
  const local = new LocalJsonlSettingsStore(filePath);
  const cloud = new SupabaseSettingsStore();
  if (m === "local_only") return local;
  if (m === "cloud_primary") {
    if (!isSupabaseConfigured()) return local;
    return cloud;
  }
  if (m === "dual_write") {
    if (!isSupabaseConfigured()) return local;
    return new DualWriteSettingsStore(local, cloud);
  }
  return local;
}

module.exports = { createSettingsStore, MemorySettingsStore, LocalJsonlSettingsStore, SupabaseSettingsStore };
