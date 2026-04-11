/**
 * public.profiles — 仅映射与 DML，不含业务编排。
 */
const { getSupabaseAdminClient } = require("../client");

function _admin() {
  const c = getSupabaseAdminClient();
  if (!c) return null;
  return c;
}

/**
 * @param {string} userId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function fetchProfile(userId) {
  const id = userId != null ? String(userId).trim() : "";
  if (!id) return null;
  const client = _admin();
  if (!client) return null;
  const { data, error } = await client.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message || "supabase_profile_select");
  return data || null;
}

/**
 * @param {{ id: string, email?: string|null, market?: string, locale?: string }} row
 */
async function upsertProfile(row) {
  const client = _admin();
  if (!client) return false;
  const { error } = await client.from("profiles").upsert(row, { onConflict: "id" });
  if (error) throw new Error(error.message || "supabase_profile_upsert");
  return true;
}

module.exports = { fetchProfile, upsertProfile };
