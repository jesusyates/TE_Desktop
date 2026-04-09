/**
 * Domain store 工厂：由 STORAGE_MODE 决定 task / memory / template 实现。
 * service 禁止 import 本文件以外的具体实现路径。
 */
const path = require("path");
const { config } = require("../infra/config");
const { isSupabaseConfigured } = require("../infra/supabase/client");

const { MemoryTaskStore } = require("./implementations/memory.task.store");
const { LocalJsonlTaskStore } = require("./implementations/local-jsonl.task.store");
const { SupabaseTaskStore } = require("./implementations/supabase.task.store");
const { DualWriteTaskStore } = require("./implementations/dual-write.task.store");

const { InMemoryMemoryDomainStore } = require("./implementations/memory.memory-domain.store");
const { LocalJsonlMemoryDomainStore } = require("./implementations/local-jsonl.memory-domain.store");
const { SupabaseMemoryDomainStore } = require("./implementations/supabase.memory-domain.store");

const { MemoryTemplateStore } = require("./implementations/memory.template.store");
const { LocalJsonlTemplateStore } = require("./implementations/local-jsonl.template.store");
const { SupabaseTemplateStore } = require("./implementations/supabase.template.store");

function resolveDomainMode(raw) {
  const m = (raw || "").toLowerCase();
  if (m === "stub_supabase") return isSupabaseConfigured() ? "cloud_primary" : "memory";
  return m;
}

function localStoreDir(c) {
  return path.join(c.backendRoot, "storage", "local-stores");
}

/**
 * @param {ReturnType<typeof config>} [c]
 */
function createDomainStores(c = config()) {
  const mode = resolveDomainMode(c.storageMode);
  const dir = localStoreDir(c);

  const taskMem = new MemoryTaskStore();
  const taskLocal = new LocalJsonlTaskStore(path.join(dir, "tasks.jsonl"));
  const taskCloud = new SupabaseTaskStore();

  const memMem = new InMemoryMemoryDomainStore();
  const memLocal = new LocalJsonlMemoryDomainStore(dir);
  const memCloud = new SupabaseMemoryDomainStore();

  const tplMem = new MemoryTemplateStore();
  const tplLocal = new LocalJsonlTemplateStore(path.join(dir, "templates.jsonl"));
  const tplCloud = new SupabaseTemplateStore();

  /** @type {{ task: import('./task-store.base').TaskStore, memory: import('./memory-domain-store.base').MemoryDomainStore, template: import('./template-store.base').TemplateStore }} */
  const out = { task: taskMem, memory: memMem, template: tplMem };

  switch (mode) {
    case "memory":
      out.task = taskMem;
      out.memory = memMem;
      out.template = tplMem;
      break;
    case "local":
      out.task = taskLocal;
      out.memory = memLocal;
      out.template = tplLocal;
      break;
    case "cloud_primary":
      out.task = taskCloud;
      out.memory = memCloud;
      out.template = tplCloud;
      break;
    case "dual_write":
      out.task = new DualWriteTaskStore(taskLocal, taskCloud);
      out.memory = memCloud;
      out.template = tplCloud;
      break;
    default:
      out.task = taskLocal;
      out.memory = memLocal;
      out.template = tplLocal;
  }

  return out;
}

module.exports = { createDomainStores, resolveDomainMode, localStoreDir };
