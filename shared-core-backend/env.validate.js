/**
 * 生产环境邮件相关：避免启动后才发现无法发信。
 */
function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function assertProductionMailConfig() {
  if (!isProd()) return;

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
