/**
 * 启动前配置校验：生产阻断 / 开发告警。
 */
const { config } = require("./index");

const ALLOWED_STORAGE = new Set([
  "memory",
  "local",
  "local_only",
  "dual_write",
  "cloud_primary",
  "stub_supabase"
]);

function validateBoot() {
  const c = config();
  const errors = [];
  const warns = [];

  if (!c.nodeEnv) errors.push("NODE_ENV missing");
  if (!c.port || c.port < 1 || c.port > 65535) errors.push("PORT invalid");

  const supabaseAuth = c.authProvider === "supabase";
  if (!supabaseAuth) {
    if (!c.jwtSecret || String(c.jwtSecret).length < 16) {
      if (c.nodeEnv === "production") errors.push("JWT_SECRET (or SHARED_CORE_AUTH_SECRET) required, min 16 chars");
      else warns.push("JWT_SECRET short or missing — dev only");
    }
  } else if (c.nodeEnv === "production") {
    if (!c.supabaseUrl || !c.supabaseServiceRoleKey || !c.supabaseAnonKey) {
      errors.push("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY required when AUTH_PROVIDER=supabase");
    }
  }

  if (!ALLOWED_STORAGE.has(c.storageMode)) {
    errors.push(`STORAGE_MODE must be one of: ${[...ALLOWED_STORAGE].join(", ")}`);
  }

  const needsSupabase =
    c.domainStorageMode === "cloud_primary" || c.domainStorageMode === "dual_write";
  if (c.nodeEnv === "production" && needsSupabase) {
    if (!c.supabaseUrl || !c.supabaseServiceRoleKey) {
      errors.push("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required when STORAGE_MODE is cloud_primary or dual_write");
    }
  }

  if (c.nodeEnv === "production") {
    const raw = process.env.ALLOWED_ORIGINS;
    if (!raw || String(raw).trim() === "") {
      errors.push("ALLOWED_ORIGINS required in production (comma-separated, no *)");
    }
  }

  for (const w of warns) console.warn(`[shared-core-boot] WARN: ${w}`);
  if (errors.length) {
    console.error("[shared-core-boot] FATAL:\n", errors.join("\n"));
    process.exit(1);
  }
}

module.exports = { validateBoot, ALLOWED_STORAGE };
