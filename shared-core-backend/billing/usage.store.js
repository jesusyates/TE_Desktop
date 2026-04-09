/**
 * C-7 — usage 存储路由：默认 SQLite（append/listSince 供观测；扣减事件主要由 entitlement 事务写入）。
 */
const mem = process.env.SHARED_CORE_STORAGE === "memory";

module.exports = mem
  ? require("./usage.store.memory")
  : require("../storage/adapters/usage.adapter");
