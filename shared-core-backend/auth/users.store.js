/**
 * MODULE C / C-7 — users 存储路由：默认 SQLite（adapter），SHARED_CORE_STORAGE=memory 为回退。
 *
 * 禁止：第二套用户体系；本地身份为权威；Web/Desktop 分裂 Auth；业务层直写 SQL。
 */
const mem = process.env.SHARED_CORE_STORAGE === "memory";

module.exports = mem
  ? require("./users.store.memory")
  : require("../storage/adapters/users.adapter");
