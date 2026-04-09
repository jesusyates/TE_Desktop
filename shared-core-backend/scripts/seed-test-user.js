/**
 * D-7-5I — 内测：向 Shared Core SQLite 写入可登录测试用户（幂等：同邮箱已存在则跳过并 exit 0）。
 *
 * 在仓库根目录执行：npm run seed:test-user
 *
 * 环境变量（可选）：
 *   TEST_USER_EMAIL      默认 tester@aics.local
 *   TEST_USER_PASSWORD   默认 TestUser#1
 *   TEST_USER_MARKET     默认 cn
 *   TEST_USER_LOCALE     默认 zh-CN
 *   SHARED_CORE_DB_PATH  默认 <shared-core-backend>/storage/shared-core.sqlite
 */
const path = require("path");

if (process.env.SHARED_CORE_STORAGE === "memory") {
  delete process.env.SHARED_CORE_STORAGE;
}
if (!process.env.SHARED_CORE_DB_PATH) {
  process.env.SHARED_CORE_DB_PATH = path.join(__dirname, "..", "storage", "shared-core.sqlite");
}

const { initStorage, closeStorage } = require("../storage/db");
const { runMigrations } = require("../storage/migrate");
const authRepository = require("../auth/auth.repository");

const email = String(process.env.TEST_USER_EMAIL || "tester@aics.local")
  .trim()
  .toLowerCase();
const password = process.env.TEST_USER_PASSWORD || "TestUser#1";
const market = process.env.TEST_USER_MARKET || "cn";
const locale = process.env.TEST_USER_LOCALE || "zh-CN";

initStorage();
runMigrations();

if (authRepository.findUserByEmail(email)) {
  console.log("[seed-test-user] already exists:", email);
  closeStorage();
  process.exit(0);
}

authRepository.createUser({ email, password, market, locale });
console.log("[seed-test-user] created:", email);
console.log("[seed-test-user] password: (see TEST_USER_PASSWORD or default above)");
closeStorage();
