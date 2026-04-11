/**
 * v1_tasks — 仅数据映射与 PostgREST 调用，不含业务规则。
 */
const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) throw new Error("supabase_client_unavailable");
  return c;
}

/**
 * @param {string} userId
 * @param {{ limit?: number }} [opts]
 */
async function listByUserId(userId, opts) {
  const limit = opts && Number.isFinite(opts.limit) ? opts.limit : 200;
  const { data, error } = await _admin()
    .from("v1_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message || "supabase_list_tasks");
  return data || [];
}

/**
 * @param {string} taskId
 */
async function selectById(taskId) {
  const { data, error } = await _admin()
    .from("v1_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_get_task");
  return data || null;
}

/**
 * @param {object} row — snake_case 与表一致
 */
async function insertRow(row) {
  const { error } = await _admin().from("v1_tasks").insert(row);
  if (error) throw new Error(error.message || "supabase_insert_task");
}

/**
 * @param {string} taskId
 * @param {string} userId
 * @param {object} patch — title, status, payload, updated_at
 */
async function updateRow(taskId, userId, patch) {
  const { data, error } = await _admin()
    .from("v1_tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_update_task");
  return data || null;
}

/**
 * @param {string} taskId
 * @param {string} userId
 */
async function deleteRow(taskId, userId) {
  const { data, error } = await _admin()
    .from("v1_tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(error.message || "supabase_delete_task");
  return Array.isArray(data) && data.length > 0;
}

async function pingHead() {
  const { error } = await _admin().from("v1_tasks").select("id", { head: true, count: "exact" });
  if (error) return { ok: false, error: error.message || String(error.code || "query_failed") };
  return { ok: true };
}

module.exports = {
  listByUserId,
  selectById,
  insertRow,
  updateRow,
  deleteRow,
  pingHead
};
