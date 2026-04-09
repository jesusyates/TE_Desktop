/**
 * Shared Core 进程入口 — 生产级 HTTP 栈见 src/main.js（Express + 分层 + 统一 context / 日志）。
 * 保留本路径以便 monorepo 脚本与文档：`node shared-core-backend/server.js`
 */
require("./src/main");
