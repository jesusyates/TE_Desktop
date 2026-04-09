const { MemoryDomainStore } = require("../memory-domain-store.base");
const { getSupabaseAdminClient } = require("../../infra/supabase/client");
const {
  userKey,
  normalizeMemoryAppend,
  normalizeMemoryEntryRow
} = require("../../schemas/domain-stores.schema");

class SupabaseMemoryDomainStore extends MemoryDomainStore {
  _c() {
    const c = getSupabaseAdminClient();
    if (!c) throw new Error("supabase_client_unavailable");
    return c;
  }

  async getPreferences(ctx) {
    const uid = userKey(ctx);
    const client = this._c();
    const { data, error } = await client
      .from("v1_memory_entries")
      .select("value")
      .eq("user_id", uid)
      .eq("entry_key", "__prefs__")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message || "supabase_memory_prefs");
    if (!data || data.value == null) return {};
    return typeof data.value === "object" ? data.value : {};
  }

  async appendEntry(ctx, partial) {
    const client = this._c();
    const uid = userKey(ctx);
    const ts = new Date().toISOString();

    if (partial && partial.mergePreferences && typeof partial.mergePreferences === "object") {
      const cur = await this.getPreferences(ctx);
      const next = { ...cur, ...partial.mergePreferences };
      const { error } = await client.from("v1_memory_entries").insert({
        user_id: uid,
        entry_key: "__prefs__",
        value: next,
        created_at: ts
      });
      if (error) throw new Error(error.message || "supabase_memory_prefs_write");
      if (partial.key == null && partial.value == null && !partial.entry_key) {
        return normalizeMemoryEntryRow({
          id: "prefs-merge",
          user_id: uid,
          entry_key: "__prefs__",
          value: next,
          created_at: ts
        });
      }
    }

    const norm = normalizeMemoryAppend(ctx, partial);
    const insert = {
      user_id: norm.user_id,
      entry_key: norm.entry_key || "note",
      value: norm.value,
      created_at: norm.created_at
    };
    const { data, error } = await client.from("v1_memory_entries").insert(insert).select("id").single();
    if (error) throw new Error(error.message || "supabase_memory_append");
    return idRow(data.id, insert);

    function idRow(id, row) {
      return normalizeMemoryEntryRow({
        id,
        user_id: row.user_id,
        entry_key: row.entry_key,
        value: row.value,
        created_at: row.created_at
      });
    }
  }

  async listEntries(ctx, limit = 200) {
    const uid = userKey(ctx);
    const client = this._c();
    const { data, error } = await client
      .from("v1_memory_entries")
      .select("*")
      .eq("user_id", uid)
      .neq("entry_key", "__prefs__")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message || "supabase_memory_list");
    return (data || []).map((r) => normalizeMemoryEntryRow(r));
  }
}

module.exports = { SupabaseMemoryDomainStore };
