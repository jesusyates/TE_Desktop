/**
 * 生产环境邮件相关：避免启动后才发现无法发信。
 * AUTH_PROVIDER=supabase 时：验证/邀请等邮件由 Supabase Auth 侧配置（控制台 SMTP / 托管），**不要求** Core 配置 AUTH_SMTP_*。
 */
function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function assertProductionMailConfig() {
  if (!isProd()) return;

  const { config } = require("./src/infra/config");
  if (config().authProvider === "supabase") {
    return;
  }

  const sink = String(process.env.AUTH_MAIL_SINK || "").trim().toLowerCase();
  if (sink === "console" || sink === "mock" || sink === "none") {
    console.warn(
      "[shared-core-backend] 警告: NODE_ENV=production 但 AUTH_MAIL_SINK 为开发用 sink，请勿用于真实对外服务。"
    );
    return;
  }

  const host = process.env.AUTH_SMTP_HOST;
  if (!host || !String(host).trim()) {
    throw new Error(
      "生产环境发信：请在 shared-core-backend/.env 中设置 AUTH_SMTP_HOST（及 AUTH_SMTP_* / AUTH_MAIL_FROM），" +
        "或将 AUTH_MAIL_SINK 设为 console|mock|none 仅限本地调试。参考 shared-core-backend/.env.example。"
    );
  }
}

module.exports = { assertProductionMailConfig };
