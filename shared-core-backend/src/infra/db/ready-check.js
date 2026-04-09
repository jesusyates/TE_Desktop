const storage = require("../../../storage/db");
const { config } = require("../config");
const { pingSupabase, isSupabaseConfigured } = require("../supabase/client");

async function checkReady() {
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
      supabase: { status: "skipped" }
    };
  }

  const needsRemote =
    sm === "cloud_primary" || sm === "dual_write" || (sm === "stub_supabase" && isSupabaseConfigured());

  if (!needsRemote) {
    return { ok: true, core, supabase: { status: "skipped", reason: "mode_does_not_require_supabase" } };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: "supabase_env_missing",
      core,
      supabase: { status: "misconfigured" }
    };
  }

  const ping = await pingSupabase();
  if (!ping.ok) {
    return {
      ok: false,
      error: ping.error || "supabase_unreachable",
      core,
      supabase: { status: "unhealthy", detail: ping.error }
    };
  }

  return { ok: true, core, supabase: { status: "ok" } };
}

module.exports = { checkReady };
