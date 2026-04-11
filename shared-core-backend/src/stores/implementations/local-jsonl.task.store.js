const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { TaskStore } = require("../task-store.base");
const { userKey, normalizeTaskForCreate, normalizeTaskRow } = require("../../schemas/domain-stores.schema");

class LocalJsonlTaskStore extends TaskStore {
  /** @param {string} filePath */
  constructor(filePath) {
    super();
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

  async list(ctx, _query) {
    const uid = userKey(ctx);
    const rows = this._readRows();
    return rows
      .filter((r) => r.user_id === uid || uid === "anonymous")
      .map((r) => normalizeTaskRow(r));
  }

  async getById(ctx, id) {
    const uid = userKey(ctx);
    const row = this._readRows().find((r) => r.id === id);
    if (!row) return null;
    if (row.user_id !== uid && uid !== "anonymous") return null;
    return normalizeTaskRow(row);
  }

  async create(ctx, payload) {
    const norm = normalizeTaskForCreate(ctx, payload);
    const id = payload && payload.id ? String(payload.id) : `tsk_${randomUUID()}`;
    const line = {
      id,
      user_id: norm.user_id,
      title: norm.title,
      status: norm.status,
      payload: norm.payload,
      market: norm.market,
      locale: norm.locale,
      product: norm.product,
      created_at: norm.created_at,
      updated_at: norm.updated_at
    };
    const rows = this._readRows();
    rows.push(line);
    this._writeRows(rows);
    return normalizeTaskRow(line);
  }

  async update(ctx, id, merged) {
    const uid = userKey(ctx);
    const rows = this._readRows();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const row = rows[idx];
    if (row.user_id !== uid && uid !== "anonymous") return null;
    const next = {
      ...row,
      title: merged.title,
      status: merged.status,
      payload: merged.payload,
      updated_at: merged.updated_at
    };
    rows[idx] = next;
    this._writeRows(rows);
    return normalizeTaskRow(next);
  }

  async delete(ctx, id) {
    const uid = userKey(ctx);
    const rows = this._readRows();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return false;
    if (rows[idx].user_id !== uid && uid !== "anonymous") return false;
    rows.splice(idx, 1);
    this._writeRows(rows);
    return true;
  }
}

module.exports = { LocalJsonlTaskStore };
