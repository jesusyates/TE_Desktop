const { getTaskStore } = require("../../stores/registry");
const { denormalizeRowToStoreShape, mergeTaskPatchFromBody, normalizeTaskStatus } = require("../../schemas/domain-stores.schema");

async function listTasks(ctx) {
  return getTaskStore().list(ctx, {});
}

async function createTaskFromRequest(ctx, body) {
  const b = body && typeof body === "object" ? body : {};
  return getTaskStore().create(ctx, b);
}

async function getTaskById(ctx, id) {
  return getTaskStore().getById(ctx, id);
}

async function patchTask(ctx, id, body) {
  const store = getTaskStore();
  const flat = await store.getById(ctx, id);
  if (!flat) return null;
  const existing = denormalizeRowToStoreShape(flat);
  const merged = mergeTaskPatchFromBody(existing, body);
  return store.update(ctx, id, merged);
}

async function deleteTask(ctx, id) {
  return getTaskStore().delete(ctx, id);
}

/** 从已有任务克隆一条新任务（同一用户），用于 rerun */
async function rerunTask(ctx, sourceId) {
  const store = getTaskStore();
  const flat = await store.getById(ctx, sourceId);
  if (!flat) return null;
  const ex = denormalizeRowToStoreShape(flat);
  const p = (ex && ex.payload) || {};
  const oneLine =
    (p.oneLinePrompt != null ? String(p.oneLinePrompt) : "") ||
    (flat.oneLinePrompt != null ? String(flat.oneLinePrompt) : "") ||
    String(flat.title || "").trim();
  const input =
    p.input && typeof p.input === "object"
      ? p.input
      : { oneLinePrompt: oneLine, importedMaterials: Array.isArray(p.importedMaterials) ? p.importedMaterials : [] };
  return store.create(ctx, {
    title: String(flat.title || oneLine).slice(0, 500),
    oneLinePrompt: oneLine,
    input,
    status: normalizeTaskStatus("pending"),
    sourceTaskId: sourceId,
    plannerSource: flat.plannerSource != null ? flat.plannerSource : p.plannerSource,
    runType: "rerun"
  });
}

module.exports = {
  listTasks,
  createTaskFromRequest,
  getTaskById,
  patchTask,
  deleteTask,
  rerunTask
};
