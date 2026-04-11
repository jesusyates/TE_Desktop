const { randomUUID } = require("crypto");
const { TaskStore } = require("../task-store.base");
const { logStorageDiff } = require("../../infra/logging/storageDiffLogger");
const { userKey, normalizeTaskForCreate } = require("../../schemas/domain-stores.schema");

/**
 * dual_write：写并行（allSettled），本地失败则整笔失败；云失败记 storage_diff 不阻断。
 * 读：先云后本地。
 */
class DualWriteTaskStore extends TaskStore {
  /**
   * @param {TaskStore} localStore
   * @param {TaskStore} cloudStore
   */
  constructor(localStore, cloudStore) {
    super();
    this.local = localStore;
    this.cloud = cloudStore;
  }

  _rid(ctx) {
    return ctx && ctx.requestId ? String(ctx.requestId) : null;
  }

  _uid(ctx) {
    try {
      return userKey(ctx);
    } catch {
      return null;
    }
  }

  async list(ctx, query) {
    try {
      return await this.cloud.list(ctx, query);
    } catch (e) {
      logStorageDiff({
        userId: this._uid(ctx),
        entity: "task",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId: this._rid(ctx)
      });
      return this.local.list(ctx, query);
    }
  }

  async getById(ctx, id) {
    try {
      const row = await this.cloud.getById(ctx, id);
      if (row) return row;
    } catch (e) {
      logStorageDiff({
        userId: this._uid(ctx),
        entity: "task",
        operation: "read",
        localSuccess: null,
        cloudSuccess: false,
        error: e,
        requestId: this._rid(ctx)
      });
    }
    return this.local.getById(ctx, id);
  }

  async create(ctx, payload) {
    const norm = normalizeTaskForCreate(ctx, payload);
    const id =
      payload && payload.id != null && String(payload.id).trim() !== ""
        ? String(payload.id).trim()
        : `tsk_${randomUUID()}`;
    const payloadWithId = { ...(payload || {}), id };

    const [lr, cr] = await Promise.allSettled([
      this.local.create(ctx, payloadWithId),
      this.cloud.create(ctx, payloadWithId)
    ]);

    const localOk = lr.status === "fulfilled";
    const cloudOk = cr.status === "fulfilled";

    logStorageDiff({
      userId: norm.user_id,
      entity: "task",
      operation: "create",
      localSuccess: localOk,
      cloudSuccess: cloudOk,
      error: !localOk ? lr.reason : !cloudOk ? cr.reason : null,
      requestId: this._rid(ctx)
    });

    if (!localOk) throw lr.reason instanceof Error ? lr.reason : new Error(String(lr.reason));
    return lr.value;
  }

  async update(ctx, id, merged) {
    const [lr, cr] = await Promise.allSettled([
      this.local.update(ctx, id, merged),
      this.cloud.update(ctx, id, merged)
    ]);

    const localOk = lr.status === "fulfilled" && lr.value != null;
    const cloudOk = cr.status === "fulfilled" && cr.value != null;

    logStorageDiff({
      userId: this._uid(ctx),
      entity: "task",
      operation: "update",
      localSuccess: lr.status === "fulfilled",
      cloudSuccess: cr.status === "fulfilled",
      error:
        lr.status === "rejected"
          ? lr.reason
          : cr.status === "rejected"
            ? cr.reason
            : !localOk
              ? "local_update_miss"
              : !cloudOk
                ? "cloud_update_miss"
                : null,
      requestId: this._rid(ctx)
    });

    if (lr.status === "rejected") throw lr.reason instanceof Error ? lr.reason : new Error(String(lr.reason));
    if (!lr.value) return null;
    return lr.value;
  }

  async delete(ctx, id) {
    const [lr, cr] = await Promise.allSettled([
      this.local.delete(ctx, id),
      this.cloud.delete(ctx, id)
    ]);

    const localDel = lr.status === "fulfilled" ? lr.value : false;
    const cloudDel = cr.status === "fulfilled" ? cr.value : false;

    logStorageDiff({
      userId: this._uid(ctx),
      entity: "task",
      operation: "delete",
      localSuccess: lr.status === "fulfilled" && Boolean(localDel),
      cloudSuccess: cr.status === "fulfilled" && Boolean(cloudDel),
      error:
        lr.status === "rejected"
          ? lr.reason
          : cr.status === "rejected"
            ? cr.reason
            : null,
      requestId: this._rid(ctx)
    });

    if (lr.status === "rejected") throw lr.reason instanceof Error ? lr.reason : new Error(String(lr.reason));
    return Boolean(localDel);
  }
}

module.exports = { DualWriteTaskStore };
