/**
 * v1_results — id = run_id
 */
const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) throw new Error("supabase_client_unavailable");
  return c;
}

async function selectByRunId(runId) {
  const { data, error } = await _admin()
    .from("v1_results")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_result_select");
  return data || null;
}

async function listByUserId(userId, limit) {
  const lim = Math.min(500, Math.max(1, limit || 200));
  const { data, error } = await _admin()
    .from("v1_results")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) throw new Error(error.message || "supabase_result_list");
  return data || [];
}

async function insertRow(row) {
  const { error } = await _admin().from("v1_results").insert(row);
  if (error) throw new Error(error.message || "supabase_result_insert");
}

async function updateRow(runId, userId, patch) {
  const { data, error } = await _admin()
    .from("v1_results")
    .update(patch)
    .eq("id", runId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_result_update");
  return data || null;
}

module.exports = { selectByRunId, listByUserId, insertRow, updateRow };
