/**
 * Domain store 工厂：由 domainStorageMode 决定 task / memory / template / taskRun 实现。
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

const { createTaskRunStore } = require("./task/taskRun.store");
const { createResultStore } = require("./result/result.store");
const { createHistoryStore } = require("./history/history.store");
const { createMemoryAssetStore } = require("./memory/memory.store");
const { createTemplateCanonicalStore } = require("./template/template.store");
const { createUsageStore } = require("./usage/usage.store");
const { createAuditStore } = require("./audit/audit.store");
const { createSettingsStore } = require("./settings/settings.store");
const { createFeatureFlagStore } = require("./featureFlag/featureFlag.store");

function localStoreDir(c) {
  return path.join(c.backendRoot, "storage", "local-stores");
}

/**
 * @param {ReturnType<typeof config>} [c]
 */
function createDomainStores(c = config()) {
  const mode = c.domainStorageMode || c.storageMode;
  const dir = localStoreDir(c);

  const taskMem = new MemoryTaskStore();
  const taskLocal = new LocalJsonlTaskStore(path.join(dir, "tasks.jsonl"));
  const taskCloud = new SupabaseTaskStore();

  const memMem = new InMemoryMemoryDomainStore();
  const memLocal = new LocalJsonlMemoryDomainStore(dir);
  const memCloud = new SupabaseMemoryDomainStore();

  const memoryAsset = createMemoryAssetStore(mode, dir);
  const templateCanon = createTemplateCanonicalStore(mode, dir);
  const usage = createUsageStore(mode, dir);
  const audit = createAuditStore(mode, dir);
  const settings = createSettingsStore(mode, dir);
  const featureFlag = createFeatureFlagStore(mode, dir);

  const taskRunPath = path.join(dir, "task-runs.jsonl");
  const taskRun = createTaskRunStore(mode, taskRunPath);
  const resultsPath = path.join(dir, "results.jsonl");
  const historyPath = path.join(dir, "history.jsonl");
  const result = createResultStore(mode, resultsPath);
  const history = createHistoryStore(mode, historyPath);

  /** @type {{ task: import('./task-store.base').TaskStore, memory: import('./memory-domain-store.base').MemoryDomainStore, memoryAsset: object, template: import('./template-store.base').TemplateStore, usage: object, audit: object, taskRun: object, result: object, history: object }} */
  const out = {
    task: taskMem,
    memory: memMem,
    memoryAsset,
    template: templateCanon,
    usage,
    audit,
    settings,
    featureFlag,
    taskRun,
    result,
    history
  };

  switch (mode) {
    case "memory":
      out.task = taskMem;
      out.memory = memMem;
      out.memoryAsset = createMemoryAssetStore("memory", dir);
      out.template = createTemplateCanonicalStore("memory", dir);
           out.usage = createUsageStore("memory", dir);
      out.audit = createAuditStore("memory", dir);
      out.settings = createSettingsStore("memory", dir);
      out.featureFlag = createFeatureFlagStore("memory", dir);
      out.taskRun = createTaskRunStore("memory", taskRunPath);
      out.result = createResultStore("memory", resultsPath);
      out.history = createHistoryStore("memory", historyPath);
      break;
    case "local_only":
      out.task = taskLocal;
      out.memory = memLocal;
      out.memoryAsset = createMemoryAssetStore("local_only", dir);
      out.template = createTemplateCanonicalStore("local_only", dir);
      out.usage = createUsageStore("local_only", dir);
      out.audit = createAuditStore("local_only", dir);
      out.settings = createSettingsStore("local_only", dir);
      out.featureFlag = createFeatureFlagStore("local_only", dir);
      out.taskRun = createTaskRunStore("local_only", taskRunPath);
      out.result = createResultStore("local_only", resultsPath);
      out.history = createHistoryStore("local_only", historyPath);
      break;
    case "cloud_primary":
      if (isSupabaseConfigured()) {
        out.task = taskCloud;
        out.memory = memCloud;
        out.memoryAsset = createMemoryAssetStore("cloud_primary", dir);
        out.template = createTemplateCanonicalStore("cloud_primary", dir);
        out.usage = createUsageStore("cloud_primary", dir);
        out.audit = createAuditStore("cloud_primary", dir);
        out.settings = createSettingsStore("cloud_primary", dir);
        out.featureFlag = createFeatureFlagStore("cloud_primary", dir);
        out.taskRun = createTaskRunStore("cloud_primary", taskRunPath);
        out.result = createResultStore("cloud_primary", resultsPath);
        out.history = createHistoryStore("cloud_primary", historyPath);
      } else {
        out.task = taskLocal;
        out.memory = memLocal;
        out.memoryAsset = createMemoryAssetStore("local_only", dir);
        out.template = createTemplateCanonicalStore("local_only", dir);
        out.usage = createUsageStore("local_only", dir);
        out.audit = createAuditStore("local_only", dir);
        out.settings = createSettingsStore("local_only", dir);
        out.featureFlag = createFeatureFlagStore("local_only", dir);
        out.taskRun = createTaskRunStore("local_only", taskRunPath);
        out.result = createResultStore("local_only", resultsPath);
        out.history = createHistoryStore("local_only", historyPath);
      }
      break;
    case "dual_write":
      if (isSupabaseConfigured()) {
        out.task = new DualWriteTaskStore(taskLocal, taskCloud);
        out.memory = memCloud;
        out.memoryAsset = createMemoryAssetStore("dual_write", dir);
        out.template = createTemplateCanonicalStore("dual_write", dir);
        out.usage = createUsageStore("dual_write", dir);
        out.audit = createAuditStore("dual_write", dir);
        out.settings = createSettingsStore("dual_write", dir);
        out.featureFlag = createFeatureFlagStore("dual_write", dir);
        out.taskRun = createTaskRunStore("dual_write", taskRunPath);
        out.result = createResultStore("dual_write", resultsPath);
        out.history = createHistoryStore("dual_write", historyPath);
      } else {
        out.task = taskLocal;
        out.memory = memLocal;
        out.memoryAsset = createMemoryAssetStore("local_only", dir);
        out.template = createTemplateCanonicalStore("local_only", dir);
        out.usage = createUsageStore("local_only", dir);
        out.audit = createAuditStore("local_only", dir);
        out.settings = createSettingsStore("local_only", dir);
        out.featureFlag = createFeatureFlagStore("local_only", dir);
        out.taskRun = createTaskRunStore("local_only", taskRunPath);
        out.result = createResultStore("local_only", resultsPath);
        out.history = createHistoryStore("local_only", historyPath);
      }
      break;
    default:
      out.task = taskLocal;
      out.memory = memLocal;
      out.memoryAsset = createMemoryAssetStore("local_only", dir);
      out.template = createTemplateCanonicalStore("local_only", dir);
      out.usage = createUsageStore("local_only", dir);
      out.audit = createAuditStore("local_only", dir);
      out.settings = createSettingsStore("local_only", dir);
      out.featureFlag = createFeatureFlagStore("local_only", dir);
      out.taskRun = createTaskRunStore("local_only", taskRunPath);
      out.result = createResultStore("local_only", resultsPath);
      out.history = createHistoryStore("local_only", historyPath);
  }

  return out;
}

/** @deprecated 使用 config().domainStorageMode */
function resolveDomainMode(raw) {
  const m = (raw || "").toLowerCase();
  if (m === "stub_supabase") return isSupabaseConfigured() ? "cloud_primary" : "memory";
  return m;
}

module.exports = { createDomainStores, resolveDomainMode, localStoreDir };
