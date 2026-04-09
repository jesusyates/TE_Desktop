const fs = require("fs");
const path = require("path");
const { MemoryDomainStore } = require("../memory-domain-store.base");
const { userKey, normalizeMemoryAppend, normalizeMemoryEntryRow } = require("../../schemas/domain-stores.schema");

class LocalJsonlMemoryDomainStore extends MemoryDomainStore {
  constructor(baseDir) {
    super();
    this.baseDir = baseDir;
    this.prefsPath = path.join(baseDir, "memory_prefs.json");
    this.entriesPath = path.join(baseDir, "memory_entries.jsonl");
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    if (!fs.existsSync(this.prefsPath)) fs.writeFileSync(this.prefsPath, "{}", "utf8");
    if (!fs.existsSync(this.entriesPath)) fs.writeFileSync(this.entriesPath, "", "utf8");
  }

  _readPrefs() {
    try {
      return JSON.parse(fs.readFileSync(this.prefsPath, "utf8") || "{}");
    } catch {
      return {};
    }
  }

  _writePrefs(obj) {
    fs.writeFileSync(this.prefsPath, JSON.stringify(obj, null, 0), "utf8");
  }

  async getPreferences(ctx) {
    const k = userKey(ctx);
    const all = this._readPrefs();
    return all[k] && typeof all[k] === "object" ? all[k] : {};
  }

  async appendEntry(ctx, partial) {
    const k = userKey(ctx);
    if (partial && partial.mergePreferences && typeof partial.mergePreferences === "object") {
      const all = this._readPrefs();
      all[k] = { ...(all[k] || {}), ...partial.mergePreferences };
      this._writePrefs(all);
      if (partial.key == null && partial.value == null && !partial.entry_key) {
        const snap = all[k] || {};
        return normalizeMemoryEntryRow({
          id: `mem_pref_${Date.now()}`,
          user_id: k,
          entry_key: "__prefs__",
          value: snap,
          created_at: new Date().toISOString()
        });
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
    fs.appendFileSync(this.entriesPath, JSON.stringify(row) + "\n", "utf8");
    return normalizeMemoryEntryRow(row);
  }

  async listEntries(ctx, limit = 200) {
    const k = userKey(ctx);
    const raw = fs.readFileSync(this.entriesPath, "utf8");
    if (!raw.trim()) return [];
    const rows = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((r) => r.user_id === k);
    return rows
      .slice(-limit)
      .reverse()
      .map((r) => normalizeMemoryEntryRow(r));
  }
}

module.exports = { LocalJsonlMemoryDomainStore };
