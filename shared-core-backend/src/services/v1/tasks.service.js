const { getTaskStore } = require("../../stores/registry");

async function listTasks(ctx) {
  return getTaskStore().list(ctx, {});
}

async function createTaskPlaceholder(ctx) {
  return getTaskStore().create(ctx, { title: "placeholder", status: "draft" });
}

async function getTaskById(ctx, id) {
  return getTaskStore().getById(ctx, id);
}

module.exports = { listTasks, createTaskPlaceholder, getTaskById };
