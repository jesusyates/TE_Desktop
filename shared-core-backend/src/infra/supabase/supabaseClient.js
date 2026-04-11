/**
 * Supabase 管理端唯一入口别名（SDK 仅允许出现在 adapter 层；此处为薄封装）。
 */
const {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  pingSupabase
} = require("./client");

module.exports = {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  pingSupabase
};
