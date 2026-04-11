/**
 * v1_task_runs — 最小运行记录。
 */
const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) throw new Error("supabase_client_unavailable");
  return c;
}

/**
 * @param {string} userId
 */
async function listByUserId(userId) {
  const { data, error } = await _admin()
    .from("v1_task_runs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message || "supabase_list_task_runs");
  return data || [];
}

/**
 * @param {string} runId
 */
async function selectById(runId) {
  const { data, error } = await _admin()
    .from("v1_task_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_get_task_run");
  return data || null;
}

/**
 * @param {object} row
 */
async function insertRow(row) {
  const { error } = await _admin().from("v1_task_runs").insert(row);
  if (error) throw new Error(error.message || "supabase_insert_task_run");
}

/**
 * @param {string} runId
 * @param {string} userId
 * @param {object} patch
 */
async function updateRow(runId, userId, patch) {
  const { data, error } = await _admin()
    .from("v1_task_runs")
    .update(patch)
    .eq("id", runId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_update_task_run");
  return data || null;
}

module.exports = { listByUserId, selectById, insertRow, updateRow };
