/**
 * 统一配置出口：禁止业务代码散读 process.env（legacy 第三方模块除外）。
 */
const path = require("path");
const { backendRoot } = require("./bootstrap-env");
const { parseAllowedOrigins } = require("../../middlewares/cors-origin.util");

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
  /** 显式 SHARED_CORE_STORAGE=memory 仍为纯内存（临时测试）；未配置 STORAGE_MODE 时默认与生产主路径一致 */
  if (readEnv("SHARED_CORE_STORAGE", "") === "memory") return "memory";
  return "dual_write";
}

/**
 * 领域存储模式：local_only | dual_write | cloud_primary（+ memory 测试）。
 *兼容历史别名：local → local_only
 */
function normalizeDomainStorageMode(raw) {
  const m = (raw || "").toLowerCase();
  if (m === "memory") return "memory";
  if (m === "local" || m === "local_only") return "local_only";
  if (m === "dual_write") return "dual_write";
  if (m === "cloud_primary" || m === "stub_supabase") return "cloud_primary";
  return "dual_write";
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

  const storageModeRaw = storageMode;
  const domainStorageMode = normalizeDomainStorageMode(storageModeRaw);

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

    /** AI Router 最小接入（模型名仅来自 env） */
    aiProviderDefault: readEnv("AI_PROVIDER_DEFAULT", "openai"),
    aiModelDefault: readEnv("AI_MODEL_DEFAULT", "gpt-4o-mini"),
    aiTimeoutMs: readInt("AI_TIMEOUT_MS", 60_000),
    aiMaxPromptChars: readInt("AI_MAX_PROMPT_CHARS", 32_000),

    /** 新 entitlement 默认 token 上限（仅新建行；SQLite/memory insert同步） */
    quotaDefaultTokens: readInt("QUOTA_DEFAULT_TOKENS", 100_000),
    /** 估算成本：每 1K tokens 计价单位（0=不计费） */
    usageCostPer1kTokens: parseFloat(readEnv("USAGE_COST_PER_1K_TOKENS", "0")) || 0,

    /** Feature flag 默认值（对象）；市场覆盖见 featureFlagsByMarket */
    featureFlagDefaults: {},
    featureFlagsByMarket: {},

    jwtSecret: readEnv("JWT_SECRET", readEnv("SHARED_CORE_AUTH_SECRET", "")),

    allowedOrigins: parseAllowedOrigins(readEnv("ALLOWED_ORIGINS", "")),

    /** 为 "1" 时 CORS 仅信任 ALLOWED_ORIGINS，不自动放行 Electron/null/localhost（桌面联调勿开） */
    /** 生产默认仅允许 ALLOWED_ORIGINS；开发默认宽松（Electron/null/localhost） */
    corsStrict: readEnv("CORS_STRICT", nodeEnv === "production" ? "1" : "0") === "1",

    defaultMarket: readEnv("DEFAULT_MARKET", "global"),
    defaultLocale: readEnv("DEFAULT_LOCALE", "en-US"),
    defaultProduct: readEnv("DEFAULT_CLIENT_PRODUCT", ""),
    defaultPlatform: readEnv("DEFAULT_CLIENT_PLATFORM", ""),

    /** 原始 env（含 local / memory 等历史值） */
    storageMode: storageModeRaw,
    /** 归一后领域模式 */
    domainStorageMode,

    trustProxy: readEnv("TRUST_PROXY", nodeEnv === "production" ? "1" : "0"),
    jsonBodyLimit: readEnv("JSON_BODY_LIMIT", "2mb"),
    urlEncodedBodyLimit: readEnv("URLENCODED_BODY_LIMIT", "256kb"),

    rateLimitWindowMs: readInt("RATE_LIMIT_WINDOW_MS", 60_000),
    rateLimitMax: readInt("RATE_LIMIT_MAX", 10_000),

    /** 连续 AI 提供商失败次数上限，超过则短暂 mock */
    aiFailureStreakMax: readInt("AI_FAILURE_STREAK_MAX", 3),
    aiFailureDegradeMs: readInt("AI_FAILURE_DEGRADE_MS", 120_000),

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

module.exports = { config, getConfig, readEnv, parseAllowedOrigins, normalizeDomainStorageMode };
