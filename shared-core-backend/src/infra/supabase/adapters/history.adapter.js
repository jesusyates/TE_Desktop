/**
 * v1_history
 */
const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) throw new Error("supabase_client_unavailable");
  return c;
}

async function selectById(historyId) {
  const { data, error } = await _admin()
    .from("v1_history")
    .select("*")
    .eq("id", historyId)
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_history_select");
  return data || null;
}

async function listByUserId(userId, limit, offset) {
  const lim = Math.min(100, Math.max(1, limit || 20));
  const off = Math.max(0, offset || 0);
  const { data, error } = await _admin()
    .from("v1_history")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(off, off + lim - 1);
  if (error) throw new Error(error.message || "supabase_history_list");
  return data || [];
}

async function countByUserId(userId) {
  const { count, error } = await _admin()
    .from("v1_history")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message || "supabase_history_count");
  return typeof count === "number" ? count : 0;
}

async function insertRow(row) {
  const { error } = await _admin().from("v1_history").insert(row);
  if (error) throw new Error(error.message || "supabase_history_insert");
}

async function updateRow(historyId, userId, patch) {
  const { data, error } = await _admin()
    .from("v1_history")
    .update(patch)
    .eq("id", historyId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_history_update");
  return data || null;
}

async function deleteRow(historyId, userId) {
  const { data, error } = await _admin()
    .from("v1_history")
    .delete()
    .eq("id", historyId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(error.message || "supabase_history_delete");
  return Array.isArray(data) && data.length > 0;
}

module.exports = { selectById, listByUserId, countByUserId, insertRow, updateRow, deleteRow };
