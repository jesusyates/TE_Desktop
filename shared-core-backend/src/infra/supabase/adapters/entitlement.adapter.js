/**
 * v1_entitlements — 与本地 SQLite 计费行镜像；仅映射层。
 */
const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) throw new Error("supabase_client_unavailable");
  return c;
}

/**
 * @param {string} userId
 * @param {string} product
 */
async function fetchByUserProduct(userId, product) {
  const { data, error } = await _admin()
    .from("v1_entitlements")
    .select("*")
    .eq("user_id", userId)
    .eq("product", product)
    .maybeSingle();
  if (error) throw new Error(error.message || "supabase_entitlement_select");
  return data || null;
}

/**
 * @param {object} row — user_id, product, plan, quota, used, status, created_at?, updated_at?
 */
async function upsertRow(row) {
  const { error } = await _admin().from("v1_entitlements").upsert(row, {
    onConflict: "user_id,product"
  });
  if (error) throw new Error(error.message || "supabase_entitlement_upsert");
}

module.exports = { fetchByUserProduct, upsertRow };
