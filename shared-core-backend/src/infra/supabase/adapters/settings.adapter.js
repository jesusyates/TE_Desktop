const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) throw new Error("supabase_client_unavailable");
  return c;
}

async function selectByUserId(userId) {
  const { data, error } = await _admin()
    .from("v1_user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_settings_get");
  return data || null;
}

async function upsertRow(row) {
  const { error } = await _admin().from("v1_user_settings").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message || "supabase_settings_upsert");
}

module.exports = { selectByUserId, upsertRow };
