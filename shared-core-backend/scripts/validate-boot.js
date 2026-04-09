/**
 * 生产/本机启动前配置校验（不拉起 HTTP、不初始化 SQLite）。
 * 用法：NODE_ENV=production npm run validate:boot
 */
const { bootstrapEnv } = require("../src/infra/config/bootstrap-env");
const { validateBoot } = require("../src/infra/config/validate-boot");
const { assertProductionMailConfig } = require("../env.validate");

bootstrapEnv();
validateBoot();

try {
  assertProductionMailConfig();
} catch (e) {
  console.error("[shared-core-boot] FATAL (mail):", e.message || e);
  process.exit(1);
}

console.log("[shared-core-boot] OK — configuration passes preflight checks.");
