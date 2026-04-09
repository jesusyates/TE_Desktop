const { getTemplateStore } = require("../../stores/registry");

async function listTemplates(ctx) {
  return getTemplateStore().list(ctx);
}

async function createTemplate(ctx, payload) {
  return getTemplateStore().create(ctx, payload);
}

async function getTemplateById(ctx, id) {
  return getTemplateStore().getById(ctx, id);
}

module.exports = { listTemplates, createTemplate, getTemplateById };
