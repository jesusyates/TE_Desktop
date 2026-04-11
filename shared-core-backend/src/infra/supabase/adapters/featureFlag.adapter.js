const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) throw new Error("supabase_client_unavailable");
  return c;
}

async function selectOverridesByUserId(userId) {
  const { data, error } = await _admin()
    .from("v1_feature_flag_overrides")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_ff_get");
  return data || null;
}

async function upsertOverrides(row) {
  const { error } = await _admin()
    .from("v1_feature_flag_overrides")
    .upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message || "supabase_ff_upsert");
}

module.exports = { selectOverridesByUserId, upsertOverrides };
