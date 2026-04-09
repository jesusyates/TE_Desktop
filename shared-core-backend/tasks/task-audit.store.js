/**
 * C-8 — task 审计存储路由。
 */
const mem = process.env.SHARED_CORE_STORAGE === "memory";

module.exports = mem
  ? require("./task-audit.store.memory")
  : require("../storage/adapters/task-audit.adapter");
