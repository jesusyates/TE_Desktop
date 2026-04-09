/**
 * D-7-3J：POST /task 轻量落盘（JSONL + 缓冲），与 result/memory 同目录。
 */
const fs = require("fs");
const path = require("path");
const { resolveCoreDataDir } = require("./resolveCoreDataDir");

const DATA_DIR = resolveCoreDataDir();
const TASK_INGRESS_FILE = path.join(DATA_DIR, "task-ingress.jsonl");

const recentBuffer = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * @param {{ userId: string; clientId: string; sessionToken?: string }} identity
 * @param {{ prompt?: string }} body
 */
function appendTaskIngress(identity, body) {
  ensureDataDir();
  const row = {
    receivedAt: new Date().toISOString(),
    ...identity,
    prompt: typeof body?.prompt === "string" ? body.prompt : ""
  };
  recentBuffer.push(row);
  if (recentBuffer.length > 200) recentBuffer.shift();
  const line = `${JSON.stringify(row)}\n`;
  fs.appendFileSync(TASK_INGRESS_FILE, line, "utf8");
  return { ok: true };
}

module.exports = { appendTaskIngress, DATA_DIR };
