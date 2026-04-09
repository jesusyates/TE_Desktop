const { MemoryDomainStore } = require("../memory-domain-store.base");
const { userKey, normalizeMemoryAppend, normalizeMemoryEntryRow } = require("../../schemas/domain-stores.schema");

class InMemoryMemoryDomainStore extends MemoryDomainStore {
  constructor() {
    super();
    /** @type {Map<string, Map<string, unknown>>} */
    this._prefs = new Map();
    /** @type {Map<string, Array<object>>} */
    this._entries = new Map();
  }

  _bucket(userKey) {
    if (!this._entries.has(userKey)) this._entries.set(userKey, []);
    return this._entries.get(userKey);
  }

  async getPreferences(ctx) {
    const k = userKey(ctx);
    const m = this._prefs.get(k);
    return m ? Object.fromEntries(m.entries()) : {};
  }

  async appendEntry(ctx, partial) {
    const k = userKey(ctx);
    if (partial && partial.mergePreferences && typeof partial.mergePreferences === "object") {
      if (!this._prefs.has(k)) this._prefs.set(k, new Map());
      const m = this._prefs.get(k);
      for (const [kk, vv] of Object.entries(partial.mergePreferences)) {
        m.set(String(kk), vv);
      }
      const snap = Object.fromEntries(m.entries());
      if (partial.key == null && partial.value == null && !partial.entry_key) {
        const row = {
          id: `mem_${Date.now()}`,
          user_id: k,
          entry_key: "__prefs__",
          value: snap,
          created_at: new Date().toISOString()
        };
        return normalizeMemoryEntryRow(row);
      }
    }
    const norm = normalizeMemoryAppend(ctx, partial);
    const row = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      user_id: norm.user_id,
      entry_key: norm.entry_key,
      value: norm.value,
      created_at: norm.created_at
    };
    this._bucket(norm.user_id).push(row);
    return normalizeMemoryEntryRow(row);
  }

  async listEntries(ctx, limit = 200) {
    const k = userKey(ctx);
    const list = this._bucket(k).slice(-limit).reverse();
    return list.map((r) => normalizeMemoryEntryRow(r));
  }
}

module.exports = { InMemoryMemoryDomainStore };
