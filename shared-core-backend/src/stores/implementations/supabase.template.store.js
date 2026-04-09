const { TemplateStore } = require("../template-store.base");
const { getSupabaseAdminClient } = require("../../infra/supabase/client");
const { normalizeTemplateForCreate, normalizeTemplateRow } = require("../../schemas/domain-stores.schema");

class SupabaseTemplateStore extends TemplateStore {
  _c() {
    const c = getSupabaseAdminClient();
    if (!c) throw new Error("supabase_client_unavailable");
    return c;
  }

  async list(ctx) {
    const uid = ctx && ctx.userId;
    const client = this._c();
    const { data, error } = await client.from("v1_templates").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message || "supabase_template_list");
    return (data || [])
      .filter((t) => t.scope === "global" || t.user_id === uid)
      .slice(0, 200)
      .map((t) => normalizeTemplateRow(t));
  }

  async getById(ctx, id) {
    const uid = ctx && ctx.userId;
    const client = this._c();
    const { data, error } = await client.from("v1_templates").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message || "supabase_template_get");
    if (!data) return null;
    if (data.scope !== "global" && data.user_id !== uid) return null;
    return normalizeTemplateRow(data);
  }

  async create(ctx, payload) {
    const norm = normalizeTemplateForCreate(ctx, payload);
    const row = {
      id: norm.id,
      user_id: norm.user_id,
      scope: norm.scope,
      title: norm.title,
      body: norm.body,
      created_at: norm.created_at,
      updated_at: norm.updated_at
    };
    const client = this._c();
    const { error } = await client.from("v1_templates").insert(row);
    if (error) throw new Error(error.message || "supabase_template_insert");
    return normalizeTemplateRow(row);
  }
}

module.exports = { SupabaseTemplateStore };
