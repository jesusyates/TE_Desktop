const { TaskStore } = require("../task-store.base");
const { logger } = require("../../infra/logger");

/**
 * 双写：先 local，再 cloud；读优先 cloud，失败回落 local（均打日志，不静默）。
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

  async list(ctx, query) {
    try {
      const rows = await this.cloud.list(ctx, query);
      return rows;
    } catch (e) {
      logger.warn({
        event: "dual_read_fallback",
        domain: "task",
        op: "list",
        requestId: ctx && ctx.requestId,
        error: e.message || String(e)
      });
      return this.local.list(ctx, query);
    }
  }

  async getById(ctx, id) {
    try {
      const row = await this.cloud.getById(ctx, id);
      if (row) return row;
    } catch (e) {
      logger.warn({
        event: "dual_read_fallback",
        domain: "task",
        op: "getById",
        requestId: ctx && ctx.requestId,
        error: e.message || String(e)
      });
    }
    return this.local.getById(ctx, id);
  }

  async create(ctx, payload) {
    const localRow = await this.local.create(ctx, payload);
    try {
      await this.cloud.create(ctx, { ...(payload || {}), id: localRow.id });
    } catch (e) {
      logger.error({
        event: "dual_write_cloud_failed",
        domain: "task",
        op: "create",
        requestId: ctx && ctx.requestId,
        taskId: localRow && localRow.id,
        error: e.message || String(e)
      });
      throw new Error(`dual_write_cloud_failed: ${e.message || e}`);
    }
    return localRow;
  }

  async update(ctx, id, merged) {
    const localRow = await this.local.update(ctx, id, merged);
    if (!localRow) return null;
    try {
      await this.cloud.update(ctx, id, merged);
    } catch (e) {
      logger.error({
        event: "dual_write_cloud_failed",
        domain: "task",
        op: "update",
        requestId: ctx && ctx.requestId,
        taskId: id,
        error: e.message || String(e)
      });
      throw new Error(`dual_write_cloud_failed: ${e.message || e}`);
    }
    return localRow;
  }

  async delete(ctx, id) {
    const localOk = await this.local.delete(ctx, id);
    if (!localOk) return false;
    try {
      await this.cloud.delete(ctx, id);
    } catch (e) {
      logger.error({
        event: "dual_write_cloud_failed",
        domain: "task",
        op: "delete",
        requestId: ctx && ctx.requestId,
        taskId: id,
        error: e.message || String(e)
      });
      throw new Error(`dual_write_cloud_failed: ${e.message || e}`);
    }
    return localOk;
  }
}

module.exports = { DualWriteTaskStore };
