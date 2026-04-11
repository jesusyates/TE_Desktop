const { randomUUID } = require("crypto");
const { TaskStore } = require("../task-store.base");
const { normalizeTaskForCreate, normalizeTaskRow } = require("../../schemas/domain-stores.schema");

class MemoryTaskStore extends TaskStore {
  constructor() {
    super();
    /** @type {Map<string, object>} */
    this._rows = new Map();
  }

  _toRow(norm, id) {
    return {
      id,
      userId: norm.user_id,
      title: norm.title,
      status: norm.status,
      payload: norm.payload,
      market: norm.market,
      locale: norm.locale,
      product: norm.product,
      createdAt: norm.created_at,
      updatedAt: norm.updated_at
    };
  }

  async list(ctx, _query) {
    const uid = ctx && ctx.userId;
    return Array.from(this._rows.values())
      .filter((t) => !uid || t.userId === uid)
      .map((t) =>
        normalizeTaskRow({
          id: t.id,
          user_id: t.userId,
          title: t.title,
          status: t.status,
          payload: t.payload,
          market: t.market,
          locale: t.locale,
          product: t.product,
          created_at: t.createdAt,
          updated_at: t.updatedAt
        })
      );
  }

  async getById(ctx, id) {
    const row = this._rows.get(id);
    if (!row) return null;
    const uid = ctx && ctx.userId;
    if (uid && row.userId !== uid) return null;
    return normalizeTaskRow({
      id: row.id,
      user_id: row.userId,
      title: row.title,
      status: row.status,
      payload: row.payload,
      market: row.market,
      locale: row.locale,
      product: row.product,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    });
  }

  async create(ctx, payload) {
    const norm = normalizeTaskForCreate(ctx, payload);
    const id = payload && payload.id ? String(payload.id) : `tsk_${randomUUID()}`;
    const row = this._toRow(norm, id);
    this._rows.set(id, row);
    return normalizeTaskRow({
      id,
      user_id: row.userId,
      title: row.title,
      status: row.status,
      payload: row.payload,
      market: row.market,
      locale: row.locale,
      product: row.product,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    });
  }

  async update(ctx, id, merged) {
    const row = this._rows.get(id);
    if (!row) return null;
    const uid = ctx && ctx.userId;
    if (uid && row.userId !== uid) return null;
    const next = {
      ...row,
      title: merged.title,
      status: merged.status,
      payload: merged.payload,
      updatedAt: merged.updated_at
    };
    this._rows.set(id, next);
    return normalizeTaskRow({
      id: next.id,
      user_id: next.userId,
      title: next.title,
      status: next.status,
      payload: next.payload,
      market: next.market,
      locale: next.locale,
      product: next.product,
      created_at: next.createdAt,
      updated_at: next.updatedAt
    });
  }

  async delete(ctx, id) {
    const row = this._rows.get(id);
    if (!row) return false;
    const uid = ctx && ctx.userId;
    if (uid && row.userId !== uid) return false;
    this._rows.delete(id);
    return true;
  }
}

module.exports = { MemoryTaskStore };
