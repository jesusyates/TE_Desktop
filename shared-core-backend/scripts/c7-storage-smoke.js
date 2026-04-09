/**
 * C-7 持久化验证：重启前后一致、revoke、entitlement、preference、session_version、并发 quota。
 * 运行：npm run test:c7-storage（仓库根目录）
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const tmpDb = path.join(os.tmpdir(), `aics-c7-smoke-${Date.now()}.sqlite`);
try {
  fs.unlinkSync(tmpDb);
} catch {
  /* ignore */
}

process.env.SHARED_CORE_DB_PATH = tmpDb;
delete process.env.SHARED_CORE_STORAGE;
process.env.SHARED_CORE_AUTH_SECRET = process.env.SHARED_CORE_AUTH_SECRET || "c7_test_secret_minimum_16";
process.env.AUTH_BOOTSTRAP_EMAIL = "c7-smoke@test.local";
process.env.AUTH_BOOTSTRAP_PASSWORD = "smoke-pass-1";

const { initStorage, closeStorage, getDb } = require("../storage/db");
const { runMigrations } = require("../storage/migrate");
const { runConsistencyCheck } = require("../storage/consistency");
const authRepository = require("../auth/auth.repository");
const entitlementStore = require("../billing/entitlement.store");
const preferencesRepo = require("../preferences/preferences.repository");
const preferencesSync = require("../preferences/preferences-sync.service");

function reopen() {
  closeStorage();
  initStorage();
  runMigrations();
  runConsistencyCheck();
}

function assert(cond, msg) {
  if (!cond) {
    console.error("[c7-smoke] FAIL:", msg);
    process.exit(1);
  }
}

console.log("[c7-smoke] db file:", tmpDb);

initStorage();
runMigrations();
runConsistencyCheck();

authRepository.bootstrapFromEnv();
const user = authRepository.findUserByEmail("c7-smoke@test.local");
assert(user && user.user_id, "bootstrap user");

assert(
  authRepository.findUserByEmail("c7-smoke@test.local").user_id === user.user_id,
  "bootstrap idempotent (same user_id)"
);

authRepository.saveRefreshToken("jti-smoke-1", user.user_id, 86400000);
assert(authRepository.findRefreshToken("jti-smoke-1") != null, "refresh active");
authRepository.revokeToken("jti-smoke-1");
assert(authRepository.findRefreshToken("jti-smoke-1") == null, "refresh revoked in-process");

reopen();
assert(authRepository.findRefreshToken("jti-smoke-1") == null, "refresh revoked after reopen");

const r1 = entitlementStore.atomicConsume(user.user_id, "aics", "task_run", 3);
assert(r1.ok && r1.entitlement.used === 3, "entitlement consume");
reopen();
const entAfter = entitlementStore.getOrCreate(user.user_id, "aics");
assert(entAfter.used === 3, "entitlement.used survives reopen");

preferencesRepo.upsert({
  user_id: user.user_id,
  market: "jp",
  locale: "en-US",
  updated_at: new Date().toISOString(),
  source: "manual"
});
assert(preferencesRepo.findByUserId(user.user_id).market === "jp", "preference write");

const v0 = preferencesSync.getCurrentSessionVersion(user.user_id);
preferencesSync.bumpSessionVersion(user.user_id, {});
const v1 = preferencesSync.getCurrentSessionVersion(user.user_id);
assert(v1 === v0 + 1, "session_version bump");

reopen();
assert(preferencesRepo.findByUserId(user.user_id).market === "jp", "preference survives reopen");
assert(preferencesSync.getCurrentSessionVersion(user.user_id) === v1, "session_version survives reopen");

const r402 = entitlementStore.atomicConsume(user.user_id, "aics", "task_run", 99999);
assert(!r402.ok && r402.code === "quota_exceeded", "quota_exceeded when over limit");

getDb().prepare(`UPDATE entitlements SET used = 99 WHERE user_id = ? AND product = ?`).run(user.user_id, "aics");
closeStorage();

const childPath = path.join(__dirname, "c7-consume-child.js");
const envBase = {
  ...process.env,
  SHARED_CORE_DB_PATH: tmpDb,
  C7_USER_ID: user.user_id,
  SHARED_CORE_STORAGE_LOG: "0"
};

function runChild() {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, [childPath], { env: envBase, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    c.stdout.on("data", (d) => {
      out += d.toString();
    });
    c.on("error", reject);
    c.on("exit", (code) => {
      if (code !== 0) reject(new Error("child exit " + code));
      else resolve(out.trim());
    });
  });
}

function parseChildJson(out) {
  const line = out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("{"));
  if (!line) throw new Error("no_json_line: " + out);
  return JSON.parse(line);
}

Promise.all([runChild(), runChild()])
  .then((outs) => {
    const results = outs.map((o) => parseChildJson(o));
    const oks = results.filter((r) => r.ok);
    const fails = results.filter((r) => !r.ok && r.code === "quota_exceeded");
    assert(oks.length === 1 && fails.length === 1, `concurrent last unit: ${JSON.stringify(results)}`);

    initStorage();
    runMigrations();
    runConsistencyCheck();
    const final = entitlementStore.getOrCreate(user.user_id, "aics");
    assert(final.used === 100, "used is 100 after one winning child");

    closeStorage();
    try {
      fs.unlinkSync(tmpDb);
    } catch {
      /* ignore */
    }
    console.log("[c7-smoke] ALL OK");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
