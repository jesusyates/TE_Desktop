/**
 * C-7 — refresh 存储路由：默认 SQLite。
 *
 * 禁止：重启后复活已吊销 jti；客户端绕过 Core 判定 refresh。
 */
const mem = process.env.SHARED_CORE_STORAGE === "memory";

module.exports = mem
  ? require("./refresh.store.memory")
  : require("../storage/adapters/refresh.adapter");
