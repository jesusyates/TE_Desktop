const { randomUUID } = require("crypto");
const { TaskStore } = require("../task-store.base");
const { getSupabaseAdminClient } = require("../../infra/supabase/client");
const {
  userKey,
  normalizeTaskForCreate,
  normalizeTaskRow
} = require("../../schemas/domain-stores.schema");

class SupabaseTaskStore extends TaskStore {
  _client() {
    const c = getSupabaseAdminClient();
    if (!c) throw new Error("supabase_client_unavailable");
    return c;
  }

  async list(ctx, _query) {
    const uid = userKey(ctx);
    const client = this._client();
    const q = client
      .from("v1_tasks")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(200);
    const { data, error } = await q;
    if (error) throw new Error(error.message || "supabase_list_tasks");
    return (data || []).map((r) => normalizeTaskRow(r));
  }

  async getById(ctx, id) {
    const uid = userKey(ctx);
    const client = this._client();
    const { data, error } = await client.from("v1_tasks").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message || "supabase_get_task");
    if (!data) return null;
    if (data.user_id !== uid && uid !== "anonymous") return null;
    return normalizeTaskRow(data);
  }

  async create(ctx, payload) {
    const norm = normalizeTaskForCreate(ctx, payload);
    const id = payload && payload.id ? String(payload.id) : `tsk_${randomUUID()}`;
    const row = {
      id,
      user_id: norm.user_id,
      title: norm.title,
      status: norm.status,
      payload: norm.payload,
      created_at: norm.created_at,
      updated_at: norm.updated_at
    };
    const client = this._client();
    const { error } = await client.from("v1_tasks").insert(row);
    if (error) throw new Error(error.message || "supabase_insert_task");
    return normalizeTaskRow(row);
  }

  async update(ctx, id, merged) {
    const uid = userKey(ctx);
    const client = this._client();
    const { data, error } = await client
      .from("v1_tasks")
      .update({
        title: merged.title,
        status: merged.status,
        payload: merged.payload,
        updated_at: merged.updated_at
      })
      .eq("id", id)
      .eq("user_id", uid)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message || "supabase_update_task");
    if (!data) return null;
    return normalizeTaskRow(data);
  }

  async delete(ctx, id) {
    const uid = userKey(ctx);
    const client = this._client();
    const { data, error } = await client.from("v1_tasks").delete().eq("id", id).eq("user_id", uid).select("id");
    if (error) throw new Error(error.message || "supabase_delete_task");
    return Array.isArray(data) && data.length > 0;
  }
}

module.exports = { SupabaseTaskStore };
