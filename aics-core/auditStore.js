/**
 * D-7-3Y：轻量审计留痕（内存环形缓冲 + jsonl 追加；无查询后台）。
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const AUDIT_FILE = path.join(DATA_DIR, "audit-events.jsonl");
const MAX_BUFFER = 500;

/** @type {any[]} */
let buffer = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadBufferFromFile() {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return;
    const text = fs.readFileSync(AUDIT_FILE, "utf8");
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const tail = lines.slice(-MAX_BUFFER);
    buffer = tail.map((line) => JSON.parse(line));
  } catch (e) {
    console.error("[auditStore] loadBufferFromFile failed", e);
    buffer = [];
  }
}

loadBufferFromFile();

/**
 * 非阻塞：下一 tick 写入缓冲与文件，避免阻塞 HTTP 主链。
 * @param {Record<string, unknown>} record
 */
function appendAuditEvent(record) {
  const createdAt =
    typeof record.createdAt === "string" && record.createdAt.trim()
      ? record.createdAt.trim()
      : new Date().toISOString();
  const full = { ...record, createdAt };

  setImmediate(() => {
    try {
      buffer.push(full);
      if (buffer.length > MAX_BUFFER) {
        buffer = buffer.slice(-MAX_BUFFER);
      }
      ensureDataDir();
      fs.appendFile(AUDIT_FILE, `${JSON.stringify(full)}\n`, (err) => {
        if (err) console.error("[auditStore] appendFile failed", err);
      });
    } catch (e) {
      console.error("[auditStore] appendAuditEvent failed", e);
    }
  });
}

/**
 * @param {string} userId
 * @param {number} [limit]
 */
function listAuditEventsByUser(userId, limit = 50) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const uid = String(userId ?? "");
  return buffer
    .filter((e) => e && e.userId === uid)
    .sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    })
    .slice(0, lim);
}

module.exports = {
  appendAuditEvent,
  listAuditEventsByUser,
  MAX_BUFFER
};
