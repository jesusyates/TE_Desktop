/**
 * C-7 并发验证子进程：对同一 DB 执行单次 atomicConsume。
 * 环境变量：SHARED_CORE_DB_PATH、C7_USER_ID
 */
process.env.SHARED_CORE_STORAGE_LOG = "0";

const dbp = process.env.SHARED_CORE_DB_PATH;
const userId = process.env.C7_USER_ID;
if (!dbp || !userId) {
  console.error(JSON.stringify({ ok: false, code: "missing_env" }));
  process.exit(2);
}

delete process.env.SHARED_CORE_STORAGE;

const { initStorage, closeStorage } = require("../storage/db");
const { runMigrations } = require("../storage/migrate");

initStorage();
runMigrations();

const ent = require("../storage/adapters/entitlement.adapter");
const r = ent.atomicConsume(userId, "aics", "task_run", 1);
console.log(JSON.stringify(r));

closeStorage();
process.exit(0);
