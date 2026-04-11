const storage = require("../../../storage/db");
const { config } = require("../config");
const { pingSupabase, isSupabaseConfigured } = require("../supabase/client");

/**
 * 生产环境必要变量（最小集）。
 */
function checkProductionEnv() {
  const c = config();
  if (c.nodeEnv !== "production") {
    return { ok: true, skipped: true };
  }
  const missing = [];
  if (c.authProvider === "supabase") {
    if (!c.supabaseUrl) missing.push("SUPABASE_URL");
    if (!c.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  const secret = String(c.jwtSecret || "").trim();
  if (secret.length < 16) missing.push("JWT_SECRET");
  if (missing.length) {
    return { ok: false, error: `missing_env:${missing.join(",")}` };
  }
  return { ok: true };
}

async function checkReady() {
  const envCheck = checkProductionEnv();
  if (!envCheck.ok) {
    return {
      ok: false,
      error: envCheck.error || "env_check_failed",
      core: null,
      supabase: { status: "skipped" },
      envCheck
    };
  }

  const sm = config().storageMode;
  const core = { ok: true, backend: storage.getStorageMode() };

  try {
    const mode = storage.getStorageMode();
    if (mode === "memory") {
      core.storage = "memory";
    } else {
      storage.getDb().prepare("SELECT 1 AS ok").get();
      core.storage = "local_sqlite";
    }
  } catch (e) {
    return {
      ok: false,
      error: e.message || String(e),
      core: null,
      supabase: { status: "skipped" },
      envCheck
    };
  }

  const dm = config().domainStorageMode || sm;
  const needsRemote =
    dm === "cloud_primary" || dm === "dual_write" || (sm === "stub_supabase" && isSupabaseConfigured());

  if (!needsRemote) {
    return {
      ok: true,
      core,
      supabase: { status: "skipped", reason: "mode_does_not_require_supabase" },
      envCheck
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: "supabase_env_missing",
      core,
      supabase: { status: "misconfigured" },
      envCheck
    };
  }

  const ping = await pingSupabase();
  if (!ping.ok) {
    return {
      ok: false,
      error: ping.error || "supabase_unreachable",
      core,
      supabase: { status: "unhealthy", detail: ping.error },
      envCheck
    };
  }

  return { ok: true, core, supabase: { status: "ok" }, envCheck };
}

module.exports = { checkReady };
