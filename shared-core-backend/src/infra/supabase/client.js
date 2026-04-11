/**
 * Supabase 管理端 client（仅 backend / service role；禁止打入日志）。
 */
const { createClient } = require("@supabase/supabase-js");
const { config } = require("../config");

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let _admin = null;

function isSupabaseConfigured() {
  const c = config();
  return Boolean(c.supabaseUrl && c.supabaseServiceRoleKey);
}

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
function getSupabaseAdminClient() {
  const c = config();
  if (!c.supabaseUrl || !c.supabaseServiceRoleKey) return null;
  if (_admin) return _admin;
  _admin = createClient(c.supabaseUrl, c.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  return _admin;
}

/**
 * 最小连通性探测（不记录密钥；失败只返回错误信息摘要）。
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function pingSupabase() {
  try {
    const taskAdapter = require("./adapters/task.adapter");
    return await taskAdapter.pingHead();
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { getSupabaseAdminClient, isSupabaseConfigured, pingSupabase };
