const { TemplateStore } = require("../template-store.base");
const { normalizeTemplateForCreate, normalizeTemplateRow } = require("../../schemas/domain-stores.schema");

class MemoryTemplateStore extends TemplateStore {
  constructor() {
    super();
    /** @type {object[]} */
    this._items = [];
  }

  async list(ctx) {
    const uid = ctx && ctx.userId;
    return this._items
      .filter((t) => t.scope === "global" || t.userId === uid)
      .map((t) => normalizeTemplateRow({ ...t, user_id: t.userId }));
  }

  async getById(ctx, id) {
    const t = this._items.find((x) => x.id === id);
    if (!t) return null;
    const uid = ctx && ctx.userId;
    if (t.scope !== "global" && t.userId !== uid) return null;
    return normalizeTemplateRow({ ...t, user_id: t.userId });
  }

  async create(ctx, payload) {
    const norm = normalizeTemplateForCreate(ctx, payload);
    const row = {
      id: norm.id,
      userId: norm.user_id,
      scope: norm.scope,
      title: norm.title,
      body: norm.body,
      createdAt: norm.created_at,
      updatedAt: norm.updated_at
    };
    this._items.push(row);
    return normalizeTemplateRow({
      id: row.id,
      user_id: row.userId,
      scope: row.scope,
      title: row.title,
      body: row.body,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    });
  }
}

module.exports = { MemoryTemplateStore };
