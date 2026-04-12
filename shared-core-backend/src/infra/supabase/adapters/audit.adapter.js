/**
 * v1_audit_events
 */
const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) throw new Error("supabase_client_unavailable");
  return c;
}

/**
 * @param {object} row — snake_case 行
 */
async function insertRow(row) {
  const { error } = await _admin().from("v1_audit_events").insert(row);
  if (error) throw new Error(error.message || "supabase_audit_insert");
}

/**
 * @param {string} userId
 * @param {number} limit
 */
async function listByUserId(userId, limit) {
  const lim = Math.min(200, Math.max(1, limit || 50));
  const { data, error } = await _admin()
    .from("v1_audit_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) throw new Error(error.message || "supabase_audit_list");
  return data || [];
}

module.exports = { insertRow, listByUserId };
