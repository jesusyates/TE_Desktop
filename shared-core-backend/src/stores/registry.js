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

function getTemplateStore() {
  return getDomainStores().template;
}

module.exports = {
  initDomainStores,
  getDomainStores,
  getTaskStore,
  getMemoryDomainStore,
  getTemplateStore
};
