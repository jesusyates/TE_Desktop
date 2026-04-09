/**
 * D-7-3G/H + D-7-3J：TaskResult JSONL + 内存；按 userId 隔离。
 */
const fs = require("fs");
const path = require("path");
const { resolveCoreDataDir } = require("./resolveCoreDataDir");
const { encodeJsonlLine, decodeJsonlLine } = require("./localDataLineCodec");

const DATA_DIR = resolveCoreDataDir();
const RESULTS_FILE = path.join(DATA_DIR, "results.jsonl");

/** 进程内缓存（与磁盘追加一致；重启后从 JSONL 恢复读） */
const recentBuffer = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAllRowsFromDisk() {
  if (!fs.existsSync(RESULTS_FILE)) return [];
  let raw;
  try {
    raw = fs.readFileSync(RESULTS_FILE, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split(/\n/).filter((l) => l.trim());
  const rows = [];
  for (const line of lines) {
    const row = decodeJsonlLine(line, "results.jsonl");
    if (row && typeof row === "object") rows.push(row);
  }
  return rows;
}

function rowUserId(row) {
  const u = row.userId;
  if (u != null && String(u).trim() !== "") return String(u).trim();
  return "dev-user";
}

function rowKey(row) {
  const uid = rowUserId(row);
  if (row.runId != null && String(row.runId).trim() !== "") return `${uid}|r:${String(row.runId).trim()}`;
  return `${uid}|t:${row.savedAt}:${String(row.prompt ?? "").slice(0, 32)}`;
}

function mergeDiskAndMemory(limit, userId) {
  const uid = String(userId ?? "").trim() || "dev-user";
  const disk = readAllRowsFromDisk();
  const combined = [...disk, ...recentBuffer];
  const best = new Map();
  for (const row of combined) {
    if (!row || typeof row !== "object") continue;
    if (rowUserId(row) !== uid) continue;
    const k = rowKey(row);
    const prev = best.get(k);
    const t = new Date(row.savedAt || 0).getTime();
    if (!prev || new Date(prev.savedAt || 0).getTime() <= t) best.set(k, row);
  }
  const arr = Array.from(best.values());
  arr.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  return arr.slice(0, Math.max(1, Math.min(limit, 100)));
}

/**
 * @param {object} payload — { runId?, prompt, result, stepResults? }
 */
function saveTaskResult(payload) {
  ensureDataDir();
  const row = {
    savedAt: new Date().toISOString(),
    ...payload
  };
  recentBuffer.push(row);
  if (recentBuffer.length > 500) recentBuffer.shift();
  const line = `${encodeJsonlLine(row)}\n`;
  fs.appendFileSync(RESULTS_FILE, line, "utf8");
  return { ok: true };
}

/**
 * 优先合并内存与磁盘，按 savedAt 降序，最新在前。
 * @param {number} [limit]
 */
function listRecentResults(limit = 20, userId = "dev-user") {
  return mergeDiskAndMemory(limit, userId);
}

/**
 * 先扫内存（尾部最新），再倒序扫磁盘。
 * @param {string} runId
 */
function getResultByRunId(runId, userId = "dev-user") {
  const rid = String(runId ?? "").trim();
  const uid = String(userId ?? "").trim() || "dev-user";
  if (!rid) return null;
  for (let i = recentBuffer.length - 1; i >= 0; i--) {
    const row = recentBuffer[i];
    if (String(row.runId ?? "").trim() === rid && rowUserId(row) === uid) return row;
  }
  const disk = readAllRowsFromDisk();
  for (let i = disk.length - 1; i >= 0; i--) {
    const row = disk[i];
    if (String(row.runId ?? "").trim() === rid && rowUserId(row) === uid) return row;
  }
  return null;
}

module.exports = { saveTaskResult, listRecentResults, getResultByRunId, DATA_DIR };
