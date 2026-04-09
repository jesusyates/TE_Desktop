const { randomUUID } = require("crypto");
const { TaskStore } = require("../task-store.base");
const {
  normalizeTaskForCreate,
  normalizeTaskRow
} = require("../../schemas/domain-stores.schema");

class MemoryTaskStore extends TaskStore {
  constructor() {
    super();
    /** @type {Map<string, object>} */
    this._rows = new Map();
  }

  async list(ctx, _query) {
    const uid = ctx && ctx.userId;
    return Array.from(this._rows.values())
      .filter((t) => !uid || t.userId === uid)
      .map((t) => normalizeTaskRow({ ...t, user_id: t.userId }));
  }

  async getById(ctx, id) {
    const row = this._rows.get(id);
    if (!row) return null;
    const uid = ctx && ctx.userId;
    if (uid && row.userId !== uid) return null;
    return normalizeTaskRow({ ...row, user_id: row.userId });
  }

  async create(ctx, payload) {
    const norm = normalizeTaskForCreate(ctx, payload);
    const id = payload && payload.id ? String(payload.id) : `tsk_${randomUUID()}`;
    const row = {
      id,
      userId: norm.user_id,
      title: norm.title,
      status: norm.status,
      ...norm.payload,
      createdAt: norm.created_at,
      updatedAt: norm.updated_at
    };
    this._rows.set(id, row);
    return normalizeTaskRow({ id, user_id: row.userId, title: row.title, status: row.status, payload: norm.payload, created_at: row.createdAt, updated_at: row.updatedAt });
  }
}

module.exports = { MemoryTaskStore };
