/**
 * 统一日志：开发控制台；生产 console + logs/app.log（JSON lines）。
 */
const fs = require("fs");
const path = require("path");
const { config } = require("../config");

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

let fileStream = null;

function ensureFileStream() {
  const c = config();
  if (c.nodeEnv !== "production") return null;
  if (fileStream) return fileStream;
  try {
    if (!fs.existsSync(c.logsDir)) fs.mkdirSync(c.logsDir, { recursive: true });
    const f = path.join(c.logsDir, "app.log");
    fileStream = fs.createWriteStream(f, { flags: "a" });
    return fileStream;
  } catch {
    return null;
  }
}

function shouldLog(level) {
  const c = config();
  const threshold = LEVELS[c.logLevel] != null ? LEVELS[c.logLevel] : LEVELS.info;
  return LEVELS[level] <= threshold;
}

function baseRecord(level, fields) {
  const c = config();
  return {
    timestamp: new Date().toISOString(),
    level,
    service: c.serviceName,
    env: c.nodeEnv,
    requestId: fields.requestId ?? null,
    userId: fields.userId ?? null,
    route: fields.route ?? null,
    event: fields.event ?? level,
    durationMs: fields.durationMs != null ? fields.durationMs : null,
    error:
      fields.error != null
        ? typeof fields.error === "string"
          ? fields.error
          : fields.error.message || String(fields.error)
        : null,
    ...fields
  };
}

function writeLine(obj) {
  const line = JSON.stringify(obj) + "\n";
  const c = config();
  if (c.nodeEnv === "production") {
    const s = ensureFileStream();
    if (s) s.write(line);
    if (obj.level === "error") console.error(line.trim());
    return;
  }
  if (obj.level === "error") console.error(JSON.stringify(obj));
  else if (shouldLog("debug") || obj.level !== "debug") console.log(JSON.stringify(obj));
}

function log(level, fields) {
  if (!shouldLog(level) && level !== "error") return;
  writeLine(baseRecord(level, fields));
}

const logger = {
  error: (fields) => log("error", fields),
  warn: (fields) => log("warn", fields),
  info: (fields) => log("info", fields),
  debug: (fields) => log("debug", fields)
};

module.exports = { logger };
