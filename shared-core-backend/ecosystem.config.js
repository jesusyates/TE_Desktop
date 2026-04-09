/**
 * PM2：在 shared-core-backend 目录执行 `npx pm2 start ecosystem.config.js`
 */
module.exports = {
  apps: [
    {
      name: "shared-core-backend",
      script: "src/main.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      /** PM2 5.2+：合并 .env.production（与 bootstrap-env 一致）；文件需事先存在 */
      env_file: ".env.production",
      env: {
        NODE_ENV: "production"
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      time: true
    }
  ]
};
