/**
 * 统一环境加载：.env.${NODE_ENV} → shared-core-backend/.env → 仓库根 .env（仅补全）。
 * 须在读取 config / 其它模块之前执行。
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const backendRoot = path.join(__dirname, "..", "..", "..");
const repoRoot = path.join(backendRoot, "..");

function loadEnvFile(filePath, override) {
  if (!fs.existsSync(filePath)) return;
  const result = dotenv.config({ path: filePath, override: Boolean(override) });
  if (result.error) {
    console.error(`[shared-core-backend] cannot parse env file: ${filePath}`);
    console.error(`  ${result.error.message}`);
    process.exit(1);
  }
}

function bootstrapEnv() {
  /** 先载入 .env，便于文件内声明 NODE_ENV=production（对齐服务器，勿在加载前写死 development） */
  loadEnvFile(path.join(backendRoot, ".env"), false);
  const nodeEnv = process.env.NODE_ENV || "development";
  process.env.NODE_ENV = nodeEnv;

  loadEnvFile(path.join(backendRoot, `.env.${nodeEnv}`), true);
  /** 本地覆盖（密钥、对齐变量）；不提交仓库 */
  loadEnvFile(path.join(backendRoot, ".env.local"), true);
  loadEnvFile(path.join(repoRoot, ".env"), false);

  if (process.env.JWT_SECRET && !process.env.SHARED_CORE_AUTH_SECRET) {
    process.env.SHARED_CORE_AUTH_SECRET = process.env.JWT_SECRET;
  }
  if (process.env.SHARED_CORE_AUTH_SECRET && !process.env.JWT_SECRET) {
    process.env.JWT_SECRET = process.env.SHARED_CORE_AUTH_SECRET;
  }
}

module.exports = { bootstrapEnv, backendRoot, repoRoot };
