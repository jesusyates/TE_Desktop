/**
 * D-1 — 正式 History：SQLite 或 memory 回退；禁止跨 user 读写。
 */
const { randomUUID } = require("crypto");
const { isMemoryStorage } = require("../storage/db");
const historySqlite = require("../storage/repositories/history.sqlite");

const TERMINAL_EXECUTION = new Set(["success", "failed", "partial_success", "cancelled"]);

/** @type {Array<{history_id:string,user_id,prompt,preview,status,mode,created_at,deleted:number,source_task_id?:string|null}>} */
let memoryStore = [];

/**
 * @param {{ user_id: string; prompt: string; preview?: string; status: string; mode: string; source_task_id?: string | null }} row
 * @returns {string} history_id
 */
function append({ user_id, prompt, preview, status, mode, source_task_id }) {
  const history_id = randomUUID();
  const tid = source_task_id != null && String(source_task_id).trim() ? String(source_task_id).trim().slice(0, 256) : null;
  const rec = {
    history_id,
    user_id,
    prompt: String(prompt || "").slice(0, 32000),
    preview: String(preview || "").slice(0, 500),
    status,
    mode,
    created_at: new Date().toISOString(),
    deleted: 0,
    source_task_id: tid
  };
  if (isMemoryStorage()) {
    memoryStore.push(rec);
    return history_id;
  }
  historySqlite.insert({ ...rec, source_task_id: tid });
  return history_id;
}

/**
 * @param {string | null} [status]
 */
function listByUser(user_id, page, pageSize, status = null) {
  if (isMemoryStorage()) {
    let alive = memoryStore.filter((r) => r.user_id === user_id && r.deleted === 0);
    if (status) alive = alive.filter((r) => r.status === status);
    alive.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const total = alive.length;
    const offset = (page - 1) * pageSize;
    const list = alive.slice(offset, offset + pageSize);
    return { list, total };
  }
  return historySqlite.listByUser(user_id, page, pageSize, status);
}

function softDeleteForUser(user_id, history_id) {
  if (isMemoryStorage()) {
    const r = memoryStore.find(
      (x) => x.history_id === history_id && x.user_id === user_id && x.deleted === 0
    );
    if (!r) return false;
    r.deleted = 1;
    return true;
  }
  return historySqlite.softDelete(user_id, history_id);
}

/**
 * @param {string} user_id
 * @param {string} history_id
 */
function getOneForUser(user_id, history_id) {
  const id = String(history_id || "").trim();
  if (!id) return null;
  if (isMemoryStorage()) {
    return (
      memoryStore.find((x) => x.history_id === id && x.user_id === user_id && x.deleted === 0) || null
    );
  }
  return historySqlite.getByIdForUser(user_id, id) || null;
}

function previewFromExecutionTask(task) {
  const r = task && task.result;
  if (r && typeof r === "object") {
    const body = r.body != null ? String(r.body) : "";
    const title = r.title != null ? String(r.title) : "";
    const comb = title && body ? `${title}\n${body}` : title || body;
    if (comb) return comb.slice(0, 200);
  }
  if (task && task.lastErrorSummary) return String(task.lastErrorSummary).slice(0, 200);
  return "";
}

function mapExecutionTaskToHistory(task) {
  const mode = task.plannerSource === "remote" ? "ai" : "fallback";
  if (task.status === "failed") return { status: "error", mode };
  if (task.status === "cancelled") return { status: "stopped", mode };
  return { status: "success", mode };
}

function recordIfExecutionBecameTerminal(userId, prevStatus, task) {
  if (!userId || !task) return;
  if (TERMINAL_EXECUTION.has(prevStatus)) return;
  if (!TERMINAL_EXECUTION.has(task.status)) return;
  const { status: hs, mode } = mapExecutionTaskToHistory(task);
  const preview = previewFromExecutionTask(task);
  const source_task_id = task.id != null && String(task.id).trim() ? String(task.id).trim() : null;
  append({
    user_id: userId,
    prompt: String(task.prompt || "").trim() || "（无标题）",
    preview,
    status: hs,
    mode,
    source_task_id
  });
}

module.exports = {
  append,
  listByUser,
  softDeleteForUser,
  getOneForUser,
  recordIfExecutionBecameTerminal,
  previewFromExecutionTask,
  mapExecutionTaskToHistory
};
