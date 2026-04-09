/**
 * D-7-3K：Usage 计量骨架（JSONL + 内存缓冲，按 userId 查询）。
 */
const fs = require("fs");
const path = require("path");
const { resolveCoreDataDir } = require("./resolveCoreDataDir");

const DATA_DIR = resolveCoreDataDir();
const USAGE_FILE = path.join(DATA_DIR, "usage.jsonl");
const BUFFER_MAX = 500;

const recentBuffer = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAllRowsFromDisk() {
  if (!fs.existsSync(USAGE_FILE)) return [];
  let raw;
  try {
    raw = fs.readFileSync(USAGE_FILE, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split(/\n/).filter((l) => l.trim());
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return rows;
}

function rowUserId(row) {
  const u = row.userId;
  if (u != null && String(u).trim() !== "") return String(u).trim();
  return "dev-user";
}

/**
 * @param {object} record
 */
function appendUsage(record) {
  ensureDataDir();
  const row =
    record && typeof record === "object"
      ? { ...record }
      : { userId: "dev-user", clientId: "desktop-dev", prompt: "", success: true, createdAt: new Date().toISOString() };
  if (!row.createdAt) row.createdAt = new Date().toISOString();
  recentBuffer.push(row);
  while (recentBuffer.length > BUFFER_MAX) recentBuffer.shift();
  const line = `${JSON.stringify(row)}\n`;
  fs.appendFileSync(USAGE_FILE, line, "utf8");
}

/**
 * @param {string} userId
 * @param {number} [limit]
 * @returns {object[]}
 */
function listUsageByUser(userId, limit = 50) {
  const uid = String(userId ?? "").trim() || "dev-user";
  const lim = Math.max(1, Math.min(Number(limit) || 50, 100));
  const disk = readAllRowsFromDisk();
  const combined = [...disk, ...recentBuffer];
  const filtered = combined.filter((row) => row && typeof row === "object" && rowUserId(row) === uid);
  filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return filtered.slice(0, lim);
}

module.exports = { appendUsage, listUsageByUser, DATA_DIR };
