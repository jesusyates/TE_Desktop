/**
 * Task 领域 store 工厂出口（与 STORAGE_MODE / domainStorageMode 对齐）。
 * 具体实现仍由 factory 装配；此处集中文档与 re-export。
 */
const { DualWriteTaskStore } = require("../implementations/dual-write.task.store");
const { SupabaseTaskStore } = require("../implementations/supabase.task.store");
const { LocalJsonlTaskStore } = require("../implementations/local-jsonl.task.store");
const { MemoryTaskStore } = require("../implementations/memory.task.store");

module.exports = {
  DualWriteTaskStore,
  SupabaseTaskStore,
  LocalJsonlTaskStore,
  MemoryTaskStore
};
