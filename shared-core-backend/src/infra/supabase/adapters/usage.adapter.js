/**
 * v1_usage_records
 */
const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) throw new Error("supabase_client_unavailable");
  return c;
}

/**
 * @param {object} row
 */
async function insertRow(row) {
  const { error } = await _admin().from("v1_usage_records").insert(row);
  if (error) throw new Error(error.message || "supabase_usage_insert");
}

/**
 * @param {string} userId
 * @param {number} limit
 */
async function listByUserId(userId, limit) {
  const lim = Math.min(500, Math.max(1, limit || 200));
  const { data, error } = await _admin()
    .from("v1_usage_records")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) throw new Error(error.message || "supabase_usage_list");
  return data || [];
}

module.exports = { insertRow, listByUserId };
