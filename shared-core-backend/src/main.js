const { bootstrapEnv } = require("./infra/config/bootstrap-env");
bootstrapEnv();

const { validateBoot } = require("./infra/config/validate-boot");
validateBoot();

const { config } = require("./infra/config");
const c = config();
process.env.STORAGE_MODE = c.storageMode;
if (c.storageMode === "memory" || c.storageMode === "stub_supabase") {
  process.env.SHARED_CORE_STORAGE = "memory";
} else {
  delete process.env.SHARED_CORE_STORAGE;
}

const { initDomainStores } = require("./stores/registry");
initDomainStores(c);

const { createApp } = require("./app");
const { logger } = require("./infra/logger");

const { initStorage } = require("../storage/db");
const { runMigrations } = require("../storage/migrate");
const { runConsistencyCheck } = require("../storage/consistency");
const { ensureAuthEnv } = require("../auth/auth.handlers");
const { assertProductionMailConfig } = require("../env.validate");

function bootstrapStorageAndAuth() {
  try {
    initStorage();
    runMigrations();
    runConsistencyCheck();
  } catch (e) {
    console.error("[shared-core-backend] storage init failed:", e.message || e);
    process.exit(1);
  }
  try {
    ensureAuthEnv();
  } catch (e) {
    console.error("[shared-core-backend] auth bootstrap failed:", e.message || e);
    console.error(
      "  Set AUTH_PROVIDER=supabase with SUPABASE_* keys, or legacy: JWT_SECRET + AUTH_BOOTSTRAP_* (+ AUTH_LEGACY_BOOTSTRAP_ENABLE in production)."
    );
    process.exit(1);
  }
  try {
    assertProductionMailConfig();
  } catch (e) {
    console.error("[shared-core-backend] mail environment check failed:", e.message || e);
    process.exit(1);
  }
}

function main() {
  bootstrapStorageAndAuth();
  const app = createApp();

  app.listen(c.port, "0.0.0.0", () => {
    logger.info({
      event: "server_listen",
      route: `0.0.0.0:${c.port}`,
      requestId: null,
      env: c.nodeEnv,
      storageMode: c.storageMode
    });
    console.log(
      `Shared Core Backend listening on http://0.0.0.0:${c.port} (NODE_ENV=${c.nodeEnv} STORAGE_MODE=${c.storageMode})`
    );
  });
}

main();
