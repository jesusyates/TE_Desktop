/**
 * 判定当前认证提供方（须与 src/infra/config 语义一致，优先读环境变量，避免缓存误判）。
 */
const { config } = require("../src/infra/config");

function normalizedExplicitAuthProvider() {
  const raw = process.env.AUTH_PROVIDER;
  if (raw == null || String(raw).trim() === "") return "";
  return String(raw).replace(/^\uFEFF/, "").trim().toLowerCase();
}

/** AUTH_PROVIDER=supabase 或配置推断出的 supabase */
function isAuthProviderSupabase() {
  const n = normalizedExplicitAuthProvider();
  if (n === "supabase") return true;
  if (n === "legacy") return false;
  return config().authProvider === "supabase";
}

module.exports = { isAuthProviderSupabase, normalizedExplicitAuthProvider };
