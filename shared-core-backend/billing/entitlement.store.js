/**
 * C-7 — entitlement 路由：默认 SQLite（atomicConsume 事务内写 usage_events）。
 *
 * 禁止：多计费模型；客户端 quota 权威；handler 直改 store。
 */
const mem = process.env.SHARED_CORE_STORAGE === "memory";

module.exports = mem
  ? require("./entitlement.store.memory")
  : require("../storage/adapters/entitlement.adapter");
