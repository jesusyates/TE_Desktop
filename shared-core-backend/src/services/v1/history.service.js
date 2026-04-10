const tasksService = require("./tasks.service");
const { normalizeTaskStatus } = require("../../schemas/domain-stores.schema");

function taskToHistoryItem(row) {
  if (!row || typeof row !== "object") return null;
  const prompt = String(row.title || row.oneLinePrompt || "").trim();
  const result = row.result;
  let preview = "";
  if (result && typeof result === "object") {
    const body = result.body;
    const title = result.title;
    preview = String(body != null ? body : title != null ? title : "").slice(0, 400);
  } else if (typeof result === "string") {
    preview = result.slice(0, 400);
  }
  const st = normalizeTaskStatus(row.status);
  let histStatus = "success";
  if (st === "failed") histStatus = "error";
  const modeRaw = row.mode;
  const mode = modeRaw === "local" || modeRaw === "fallback" || modeRaw === "ai" ? modeRaw : "ai";
  return {
    historyId: row.id,
    prompt,
    createdAt: row.createdAt || "",
    status: histStatus,
    mode,
    preview,
    executionTaskId: row.id
  };
}

async function listHistory(ctx, query) {
  const q = query && typeof query === "object" ? query : {};
  const page = Math.max(1, parseInt(String(q.page || "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(q.pageSize || "20"), 10) || 20));
  let items = await tasksService.listTasks(ctx);
  const stF = q.status != null ? String(q.status).toLowerCase() : "";
  if (stF === "success") {
    items = items.filter((r) => normalizeTaskStatus(r.status) === "completed");
  } else if (stF === "error") {
    items = items.filter((r) => normalizeTaskStatus(r.status) === "failed");
  }
  const sorted = [...items].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const total = sorted.length;
  const slice = sorted.slice((page - 1) * pageSize, page * pageSize);
  return {
    items: slice.map(taskToHistoryItem).filter(Boolean),
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
  };
}

async function getHistoryById(ctx, id) {
  const row = await tasksService.getTaskById(ctx, id);
  if (!row) return null;
  return taskToHistoryItem(row);
}

async function createHistoryEntry(ctx, body) {
  const b = body && typeof body === "object" ? body : {};
  const taskId = b.taskId != null ? String(b.taskId).trim() : "";
  if (taskId) {
    const exists = await tasksService.getTaskById(ctx, taskId);
    if (exists) {
      await tasksService.patchTask(ctx, taskId, {
        prompt: b.prompt,
        status: b.status != null ? normalizeTaskStatus(b.status) : undefined,
        result:
          b.preview != null
            ? { body: String(b.preview).slice(0, 32000), title: b.prompt ? String(b.prompt).slice(0, 500) : "" }
            : undefined
      });
    } else {
      await tasksService.createTaskFromRequest(ctx, {
        id: taskId,
        title: b.prompt != null ? String(b.prompt).slice(0, 500) : "",
        oneLinePrompt: b.prompt != null ? String(b.prompt).slice(0, 500) : "",
        status: normalizeTaskStatus(b.status || "pending"),
        mode: b.mode,
        preview: b.preview
      });
    }
    const row = await tasksService.getTaskById(ctx, taskId);
    return taskToHistoryItem(row);
  }
  const row = await tasksService.createTaskFromRequest(ctx, {
    title: b.prompt != null ? String(b.prompt).slice(0, 500) : "",
    oneLinePrompt: b.prompt != null ? String(b.prompt).slice(0, 500) : "",
    status: normalizeTaskStatus(b.status || "pending"),
    mode: b.mode,
    preview: b.preview
  });
  return taskToHistoryItem(row);
}

async function deleteHistory(ctx, id) {
  return tasksService.deleteTask(ctx, id);
}

module.exports = {
  listHistory,
  getHistoryById,
  createHistoryEntry,
  deleteHistory,
  taskToHistoryItem
};
