/**
 * Template规范存储封装：create / listByUser / getById
 * — 复用 LocalJsonl / Supabase 实现；dual_write 时并行写入。
 */
const path = require("path");
const { isSupabaseConfigured } = require("../../infra/supabase/client");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { userKey } = require("../../schemas/domain-stores.schema");
const { LocalJsonlTemplateStore } = require("../implementations/local-jsonl.template.store");
const { SupabaseTemplateStore } = require("../implementations/supabase.template.store");
const { MemoryTemplateStore } = require("../implementations/memory.template.store");

class DualWriteCanonicalTemplateStore {
  /**
   * @param {LocalJsonlTemplateStore} localStore
   * @param {SupabaseTemplateStore} cloudStore
   */
  constructor(localStore, cloudStore) {
    this.local = localStore;
    this.cloud = cloudStore;
  }

  _rid(ctx) {
    return ctx && ctx.requestId ? String(ctx.requestId) : null;
  }

  async create(ctx, payload, requestId = null) {
    const rid = requestId || this._rid(ctx);
    const uid = userKey(ctx);
    const [lr, cr] = await Promise.allSettled([this.local.create(ctx, payload), this.cloud.create(ctx, payload)]);
    const localOk = lr.status === "fulfilled";
    const cloudOk = cr.status === "fulfilled";
    logStorageDiff({
      userId: uid,
      entity: "template",
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
      return await this.cloud.list(ctx);
    } catch (e) {
      logStorageDiff({
        userId: uid,
        entity: "template",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId: rid
      });
      return this.local.list(ctx);
    }
  }

  /** @deprecated 与 TemplateStore 基类一致 */
  async list(ctx, requestId = null) {
    return this.listByUser(ctx, requestId);
  }

  async getById(ctx, id, requestId = null) {
    const rid = requestId || this._rid(ctx);
    const uid = userKey(ctx);
    try {
      const row = await this.cloud.getById(ctx, id);
      if (row) return row;
    } catch (e) {
      logStorageDiff({
        userId: uid,
        entity: "template",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId: rid
      });
    }
    return this.local.getById(ctx, id);
  }
}

/**
 * @param {string} mode
 * @param {string} baseDir
 */
function createTemplateCanonicalStore(mode, baseDir) {
  const m = (mode || "").toLowerCase();
  const filePath = path.join(baseDir, "templates.jsonl");
  if (m === "memory") return new MemoryTemplateStore();
  const local = new LocalJsonlTemplateStore(filePath);
  const cloud = new SupabaseTemplateStore();
  if (m === "local_only") return local;
  if (m === "cloud_primary") {
    if (!isSupabaseConfigured()) return local;
    return cloud;
  }
  if (m === "dual_write") {
    if (!isSupabaseConfigured()) return local;
    return new DualWriteCanonicalTemplateStore(local, cloud);
  }
  return local;
}

module.exports = {
  createTemplateCanonicalStore,
  DualWriteCanonicalTemplateStore
};
