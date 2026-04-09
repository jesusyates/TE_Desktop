/**
 * D-1 — GET /history/list、DELETE /history/:id、POST /history（工作台终态上报）。
 */
const historyService = require("./history.service");

const ALLOWED_STATUS = new Set(["success", "error", "stopped"]);
const ALLOWED_MODE = new Set(["ai", "local", "fallback"]);

function handleGetHistoryList(req, searchParams) {
  const userId = req.context.userId;
  let page = Number.parseInt(String(searchParams.get("page") || "1"), 10);
  let pageSize = Number.parseInt(String(searchParams.get("pageSize") || "20"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 100) pageSize = 100;

  const rawStatus = searchParams.get("status");
  const statusFilter =
    rawStatus && ALLOWED_STATUS.has(String(rawStatus).trim()) ? String(rawStatus).trim() : null;

  const { list, total } = historyService.listByUser(userId, page, pageSize, statusFilter);
  return {
    status: 200,
    body: {
      success: true,
      data: {
        items: list.map((row) => ({
          historyId: row.history_id,
          prompt: row.prompt,
          createdAt: row.created_at,
          status: row.status,
          mode: row.mode,
          preview: row.preview || "",
          executionTaskId: row.source_task_id || ""
        })),
        total,
        page,
        pageSize
      }
    }
  };
}

function handleGetHistoryOne(req, historyId) {
  const userId = req.context.userId;
  const id = String(historyId || "").trim();
  if (!id) {
    return { status: 400, body: { success: false, message: "history_id_required" } };
  }
  const row = historyService.getOneForUser(userId, id);
  if (!row) {
    return { status: 404, body: { success: false, message: "not_found" } };
  }
  return {
    status: 200,
    body: {
      success: true,
      data: {
        historyId: row.history_id,
        prompt: row.prompt,
        createdAt: row.created_at,
        status: row.status,
        mode: row.mode,
        preview: row.preview || "",
        executionTaskId: row.source_task_id || ""
      }
    }
  };
}

function handleDeleteHistory(req, historyId) {
  const userId = req.context.userId;
  const id = String(historyId || "").trim();
  if (!id) {
    return { status: 400, body: { success: false, message: "history_id_required" } };
  }
  const ok = historyService.softDeleteForUser(userId, id);
  if (!ok) {
    return { status: 404, body: { success: false, message: "not_found" } };
  }
  return { status: 200, body: { success: true } };
}

function handlePostHistory(req, body) {
  const userId = req.context.userId;
  const prompt =
    body && body.prompt != null
      ? String(body.prompt)
          .trim()
          .slice(0, 32000)
      : "";
  if (!prompt) {
    return { status: 400, body: { success: false, message: "prompt_required" } };
  }
  const status = body && body.status != null ? String(body.status).trim() : "";
  const mode = body && body.mode != null ? String(body.mode).trim() : "";
  if (!ALLOWED_STATUS.has(status) || !ALLOWED_MODE.has(mode)) {
    return { status: 400, body: { success: false, message: "invalid_status_or_mode" } };
  }
  const preview =
    body && body.preview != null ? String(body.preview).slice(0, 500) : "";
  const taskIdRaw = body && body.taskId != null ? String(body.taskId).trim().slice(0, 256) : "";
  const source_task_id = taskIdRaw || null;
  const historyId = historyService.append({ user_id: userId, prompt, preview, status, mode, source_task_id });
  return {
    status: 201,
    body: { success: true, data: { historyId } }
  };
}

module.exports = { handleGetHistoryList, handleGetHistoryOne, handleDeleteHistory, handlePostHistory };
