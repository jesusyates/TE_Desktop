/**
 * C-7 — preferences 存储路由：默认 SQLite。
 */
const mem = process.env.SHARED_CORE_STORAGE === "memory";

module.exports = mem
  ? require("./preferences.store.memory")
  : require("../storage/adapters/preferences.adapter");
