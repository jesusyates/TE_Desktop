/**
 * 统一配置出口：禁止业务代码散读 process.env（legacy 第三方模块除外）。
 */
const path = require("path");
const { backendRoot } = require("./bootstrap-env");
const { parseAllowedOrigins } = require("../middlewares/cors-origin.util");

function readEnv(key, defaultValue) {
  const v = process.env[key];
  if (v == null || String(v).trim() === "") return defaultValue;
  return String(v).trim();
}

function readInt(key, defaultValue) {
  const v = readEnv(key, null);
  if (v == null) return defaultValue;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : defaultValue;
}

function resolveStorageMode() {
  const explicit = readEnv("STORAGE_MODE", null);
  if (explicit) return explicit.toLowerCase();
  if (readEnv("SHARED_CORE_STORAGE", "") === "memory") return "memory";
  return "local";
}

function getConfig() {
  const nodeEnv = readEnv("NODE_ENV", "development");
  const port = readInt("PORT", 4000);
  const storageMode = resolveStorageMode();
  const supabaseUrl = readEnv("SUPABASE_URL", "");
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const supabaseAnonKey = readEnv("SUPABASE_ANON_KEY", "");
  const authRaw = process.env.AUTH_PROVIDER;
  let authProvider =
    authRaw == null || String(authRaw).trim() === ""
      ? ""
      : String(authRaw).replace(/^\uFEFF/, "").trim().toLowerCase();
  if (!authProvider) {
    authProvider =
      supabaseUrl && supabaseServiceRoleKey && supabaseAnonKey && nodeEnv === "production"
        ? "supabase"
        : supabaseAnonKey
          ? "supabase"
          : "legacy";
  }

  return Object.freeze({
    nodeEnv,
    port,
    apiBaseUrl: readEnv("API_BASE_URL", `http://127.0.0.1:${port}`),
    logLevel: readEnv("LOG_LEVEL", nodeEnv === "production" ? "info" : "debug"),

    supabaseUrl,
    supabaseServiceRoleKey,
    /** GoTrue password / refresh grant（仅服务端） */
    supabaseAnonKey,

    authProvider,

    openaiApiKey: readEnv("OPENAI_API_KEY", ""),

    jwtSecret: readEnv("JWT_SECRET", readEnv("SHARED_CORE_AUTH_SECRET", "")),

    allowedOrigins: parseAllowedOrigins(readEnv("ALLOWED_ORIGINS", "")),

    /** 为 "1" 时 CORS 仅信任 ALLOWED_ORIGINS，不自动放行 Electron/null/localhost（桌面联调勿开） */
    corsStrict: readEnv("CORS_STRICT", "0") === "1",

    defaultMarket: readEnv("DEFAULT_MARKET", "global"),
    defaultLocale: readEnv("DEFAULT_LOCALE", "en-US"),
    defaultProduct: readEnv("DEFAULT_CLIENT_PRODUCT", ""),
    defaultPlatform: readEnv("DEFAULT_CLIENT_PLATFORM", ""),

    storageMode,

    trustProxy: readEnv("TRUST_PROXY", nodeEnv === "production" ? "1" : "0"),
    jsonBodyLimit: readEnv("JSON_BODY_LIMIT", "2mb"),
    urlEncodedBodyLimit: readEnv("URLENCODED_BODY_LIMIT", "256kb"),

    rateLimitWindowMs: readInt("RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMax: readInt("RATE_LIMIT_MAX", 10_000),

    backendRoot,
    logsDir: path.join(backendRoot, "logs"),
    serviceName: "shared-core-backend"
  });
}

let _cached;
function config() {
  if (!_cached) _cached = getConfig();
  return _cached;
}

module.exports = { config, getConfig, readEnv, parseAllowedOrigins };
