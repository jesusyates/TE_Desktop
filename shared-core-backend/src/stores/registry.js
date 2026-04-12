const { createDomainStores } = require("./factory");

/** @type {ReturnType<typeof createDomainStores> | null} */
let _registry = null;

function initDomainStores(configSnapshot) {
  _registry = createDomainStores(configSnapshot);
}

function getDomainStores() {
  if (!_registry) {
    const { config } = require("../infra/config");
    _registry = createDomainStores(config());
  }
  return _registry;
}

function getTaskStore() {
  return getDomainStores().task;
}

function getMemoryDomainStore() {
  return getDomainStores().memory;
}

/** AICS 资产 Memory（pattern / 可复用沉淀） */
function getMemoryAssetStore() {
  return getDomainStores().memoryAsset;
}

function getTemplateStore() {
  return getDomainStores().template;
}

function getTaskRunStore() {
  return getDomainStores().taskRun;
}

function getResultStore() {
  return getDomainStores().result;
}

function getHistoryStore() {
  return getDomainStores().history;
}

function getUsageStore() {
  return getDomainStores().usage;
}

function getAuditStore() {
  return getDomainStores().audit;
}

function getSettingsStore() {
  return getDomainStores().settings;
}

function getFeatureFlagStore() {
  return getDomainStores().featureFlag;
}

module.exports = {
  initDomainStores,
  getDomainStores,
  getTaskStore,
  getMemoryDomainStore,
  getMemoryAssetStore,
  getTemplateStore,
  getTaskRunStore,
  getResultStore,
  getHistoryStore,
  getUsageStore,
  getAuditStore,
  getSettingsStore,
  getFeatureFlagStore
};
