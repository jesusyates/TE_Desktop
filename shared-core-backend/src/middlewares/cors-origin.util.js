/**
 * 统一 CORS Origin 判定（Electron / Chromium 桌面端 + ALLOWED_ORIGINS）。
 * 禁止在 app.js 内散写 Origin 规则。
 */

/** 环境变量为空时的默认白名单（逗号列表未配置） */
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000"
];

/**
 * 解析 ALLOWED_ORIGINS：逗号分隔、trim、去空串；保留字面量 "null"、"*"、"file://" 等。
 * @param {string | undefined | null} raw
 * @returns {string[]}
 */
function parseAllowedOrigins(raw) {
  if (raw == null || String(raw).trim() === "") {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function hasWildcardStar(list) {
  return Array.isArray(list) && list.some((x) => String(x).trim() === "*");
}

/**
 * CORS_STRICT 未开启时：Electron / 本地开发常见 Origin。
 * @param {string} o trim 后的 Origin
 */
function isLooseDesktopOrDevOrigin(o) {
  if (o === "null") return true;
  if (/^file:\/\//i.test(o)) return true;
  if (/^app:\/\//i.test(o)) return true;
  if (/^vscode-webview:\/\//i.test(o)) return true;
  if (/^https?:\/\/localhost(:\d+)?$/i.test(o)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/i.test(o)) return true;
  if (/^https?:\/\/\[::1\](:\d+)?$/i.test(o)) return true;
  return false;
}

/**
 * 配置中声明了 file:// 时，浏览器多发送 Origin: "null"（opaque），须视为同一意图。
 * @param {string[]} list trim 后的允许列表
 * @param {string} o trim 后的请求 Origin
 */
function matchesDeclaredSpecialOrigins(list, o) {
  const lower = list.map((x) => String(x).trim());
  if (lower.includes("file://") && o === "null") return true;
  return false;
}

/**
 * @param {string | undefined | null} origin - cors 包传入；无头时为 undefined
 * @param {{ allowedOrigins: string[], corsStrict: boolean }} cfg
 * @returns {boolean}
 */
function isAllowedCorsOrigin(origin, cfg) {
  const listRaw = Array.isArray(cfg.allowedOrigins) ? cfg.allowedOrigins : [];
  const list = listRaw.map((x) => String(x).trim()).filter((s) => s.length > 0);

  if (hasWildcardStar(list)) return true;

  if (origin === undefined || origin === null) return true;

  const o = String(origin).trim();
  if (o === "") return true;

  if (list.includes(o)) return true;
  if (matchesDeclaredSpecialOrigins(list, o)) return true;

  if (cfg.corsStrict) return false;

  return isLooseDesktopOrDevOrigin(o);
}

/**
 * @param {{ allowedOrigins: string[], corsStrict: boolean }} cfg
 * @param {string | undefined} origin
 * @param {(err: Error | null, allow?: boolean) => void} callback
 */
function corsDynamicCallback(cfg, origin, callback) {
  try {
    if (isAllowedCorsOrigin(origin, cfg)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  } catch (e) {
    callback(e instanceof Error ? e : new Error(String(e)));
  }
}

module.exports = {
  parseAllowedOrigins,
  DEFAULT_ALLOWED_ORIGINS,
  isAllowedCorsOrigin,
  corsDynamicCallback,
  hasWildcardStar,
  isLooseDesktopOrDevOrigin
};
