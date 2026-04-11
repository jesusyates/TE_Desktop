const fs = require("fs");
const path = require("path");
const { TemplateStore } = require("../template-store.base");
const { normalizeTemplateForCreate, normalizeTemplateRow } = require("../../schemas/domain-stores.schema");

class LocalJsonlTemplateStore extends TemplateStore {
  constructor(filePath) {
    super();
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

  _append(row) {
    fs.appendFileSync(this.filePath, JSON.stringify(row) + "\n", "utf8");
  }

  async list(ctx) {
    const uid = ctx && ctx.userId;
    return this._readAll()
      .filter((t) => t.scope === "global" || t.user_id === uid)
      .map((t) => normalizeTemplateRow(t));
  }

  async getById(ctx, id) {
    const uid = ctx && ctx.userId;
    const t = this._readAll().find((x) => x.id === id);
    if (!t) return null;
    if (t.scope !== "global" && t.user_id !== uid) return null;
    return normalizeTemplateRow(t);
  }

  async create(ctx, payload) {
    const norm = normalizeTemplateForCreate(ctx, payload);
    const row = {
      id: norm.id,
      user_id: norm.user_id,
      scope: norm.scope,
      title: norm.title,
      body: norm.body,
      market: norm.market,
      locale: norm.locale,
      product: norm.product,
      created_at: norm.created_at,
      updated_at: norm.updated_at
    };
    this._append(row);
    return normalizeTemplateRow(row);
  }
}

module.exports = { LocalJsonlTemplateStore };
