/**
 * AI Router 最小版：单 provider / 单模型，仅判定与元信息。
 */
const { config } = require("../../infra/config");
const { logger } = require("../../infra/logger");
const { chatComplete: openaiChatComplete } = require("../../infra/ai/providers/openai.provider");
const { chatComplete: deepseekChatComplete } = require("../../infra/ai/providers/deepseek.provider");

/**
 * 市场维度模型策略（占位：cn 等市场可在此收紧可用模型）
 * @param {string|null} market
 * @param {string} model
 * @returns {{ allowed: boolean, model: string, reason: string|null }}
 */
function marketModelPolicy(market, model) {
  const m = String(market || "").trim().toLowerCase();
  const mod = String(model || "").trim();
  if (m === "cn") {
    return { allowed: true, model: mod, reason: null };
  }
  return { allowed: true, model: mod, reason: null };
}

/**
 * 套餐是否允许走 AI（不含额度余量；余量见 quotaOk）
 * @param {object} ent
 */
function planAllowsAi(ent) {
  if (!ent || typeof ent !== "object") return false;
  if (String(ent.status || "").trim().toLowerCase() !== "active") return false;
  const plan = String(ent.plan || "free").trim().toLowerCase();
  if (plan === "none" || plan === "blocked") return false;
  if (ent.aiEnabled === false) return false;
  return true;
}

/** @param {object} ent */
function quotaHasHeadroom(ent) {
  if (!ent || typeof ent !== "object") return false;
  const quota = Number(ent.quota);
  const used = Number(ent.used);
  if (!Number.isFinite(quota) || !Number.isFinite(used)) return false;
  return used < quota;
}

/**
 * 模型门禁：未配置 allowedModel 则仅允许默认模型
 * @param {object} ent
 * @param {string} model
 * @param {string} defaultModel
 */
function modelAllowedForEntitlement(ent, model, defaultModel) {
  const m = String(model || "").trim();
  const def = String(defaultModel || "").trim();
  if (!m) return false;
  const allowed =
    ent && ent.allowedModel != null && String(ent.allowedModel).trim() !== ""
      ? String(ent.allowedModel).trim()
      : def;
  return m === allowed;
}

/** @deprecated 使用 planAllowsAi + quotaHasHeadroom */
function entitlementAllowsAi(ent) {
  return planAllowsAi(ent) && quotaHasHeadroom(ent);
}

/**
 * @param {object} input
 * @param {string} input.userPrompt
 * @param {string} [input.taskType]
 * @param {string} [input.complexity]
 * @param {string|null} [input.market]
 * @param {string|null} [input.locale]
 * @param {object} [input.entitlement]
 * @param {string|null} [input.requestId]
 * @param {string} [input.userId]
 * @param {string} [input.riskLevel] — L0 | L2 | L4
 * @param {object} [input.settings] — normalizeSettingsRecord 形状
 * @param {object} [input.featureFlags] — resolveFlags 合并结果
 */
/**
 * 归一化 Router provider：必须 trim，否则 env 中带空格会导致误判为 openai 并检查 OPENAI_API_KEY。
 * @param {string} [provider]
 * @returns {"deepseek"|"openai"}
 */
function normalizeAiProvider(provider) {
  const p = String(provider ?? "openai").trim().toLowerCase();
  return p === "deepseek" ? "deepseek" : "openai";
}

/**
 * 当前默认 provider 是否已配置 API Key（仅检查与 provider 对应的 env）
 * @param {ReturnType<typeof import("../../infra/config").config>} c
 * @param {string} provider
 */
function providerHasApiKey(c, provider) {
  const p = normalizeAiProvider(provider);
  if (p === "deepseek") {
    return Boolean(c.deepseekApiKey && String(c.deepseekApiKey).trim() !== "");
  }
  return Boolean(c.openaiApiKey && String(c.openaiApiKey).trim() !== "");
}

/**
 * 与 provider 对齐的默认模型名（仅 Router 预览；执行层再次兜底）
 */
function defaultModelForProvider(c, provider) {
  const p = normalizeAiProvider(provider);
  if (p === "deepseek") {
    return String(c.deepseekModelDefault || "deepseek-chat").trim();
  }
  return String(c.aiModelDefault || "gpt-4.1-mini").trim();
}

/**
 * @param {string} provider
 * @returns {typeof openaiChatComplete}
 */
function resolveChatComplete(provider) {
  const p = normalizeAiProvider(provider);
  if (p === "deepseek") return deepseekChatComplete;
  return openaiChatComplete;
}

/**
 * @param {ReturnType<typeof import("../../infra/config").config>} c
 * @param {string} provider
 */
function apiKeyForProvider(c, provider) {
  const p = normalizeAiProvider(provider);
  if (p === "deepseek") return String(c.deepseekApiKey || "").trim();
  return String(c.openaiApiKey || "").trim();
}

/**
 * 环境变量 AI_GATE_USER_ID_ALLOWLIST：仅列内账号抬额度/活跃态（显式 none/blocked 计划不处理）。
 */
function applyAiGateAllowlist(entIn, userId) {
  const c = config();
  const list = c.aiGateUserIdAllowlist || [];
  const uid = String(userId || "").trim();
  if (!uid || !Array.isArray(list) || !list.includes(uid)) {
    return { entitlement: entIn && typeof entIn === "object" ? entIn : {}, allowlistApplied: false };
  }
  const base = entIn && typeof entIn === "object" ? { ...entIn } : {};
  const plan = String(base.plan || "free").trim().toLowerCase();
  if (plan === "none" || plan === "blocked") {
    return { entitlement: entIn && typeof entIn === "object" ? entIn : {}, allowlistApplied: false };
  }
  const defaultQ =
    Number.isFinite(Number(c.quotaDefaultTokens)) && Number(c.quotaDefaultTokens) > 0
      ? Number(c.quotaDefaultTokens)
      : 100_000;
  let quota = Number(base.quota);
  let used = Number(base.used);
  if (!Number.isFinite(used) || used < 0) used = 0;
  if (!Number.isFinite(quota) || quota < 1) quota = defaultQ;
  if (used >= quota) quota = used + defaultQ;
  logger.info({
    event: "ai_gate_allowlist_applied",
    userId: uid,
    previousQuota: base.quota,
    previousUsed: base.used,
    effectiveQuota: quota,
    effectiveUsed: used
  });
  return {
    entitlement: {
      ...base,
      plan: plan || "free",
      status: "active",
      quota,
      used
    },
    allowlistApplied: true
  };
}

function previewRoute(input) {
  const c = config();
  const provider = normalizeAiProvider(c.aiProviderDefault || "deepseek");
  let model = defaultModelForProvider(c, provider);
  const prompt = String((input && input.userPrompt) || "").trim();
  const hasKey = providerHasApiKey(c, provider);
  const risk = String((input && input.riskLevel) || "L0");
  const rawEnt = (input && input.entitlement) || {};
  const { entitlement: ent, allowlistApplied } = applyAiGateAllowlist(rawEnt, input && input.userId);
  const planOk = planAllowsAi(ent);
  const quotaOk = quotaHasHeadroom(ent);
  const market = input && input.market != null ? String(input.market) : null;
  const mktPol = marketModelPolicy(market, model);
  model = mktPol.model;
  const defModel = defaultModelForProvider(c, provider);
  const modelOk = modelAllowedForEntitlement(ent, model, defModel);

  let reason = "default_minimal_route";
  let canExecute =
    hasKey &&
    planOk &&
    quotaOk &&
    modelOk &&
    mktPol.allowed &&
    risk !== "L4" &&
    prompt.length > 0;

  /** 与分支顺序一致：第一个失败的维度即主阻塞字段（便于日志排障） */
  let blockingField = null;

  if (!hasKey) {
    canExecute = false;
    reason = provider === "deepseek" ? "missing_deepseek_key" : "missing_openai_key";
    blockingField = "providerApiKey";
  } else if (risk === "L4") {
    canExecute = false;
    reason = "risk_level_l4_blocked";
    blockingField = "riskLevel";
  } else if (!planOk) {
    canExecute = false;
    reason = "entitlement_blocked";
    blockingField = "planAllowsAi";
  } else if (!quotaOk) {
    canExecute = false;
    reason = "quota_exceeded";
    blockingField = "quotaHasHeadroom";
  } else if (!modelOk) {
    canExecute = false;
    reason = "model_not_allowed";
    blockingField = "modelAllowedForEntitlement";
  } else if (!mktPol.allowed) {
    canExecute = false;
    reason = mktPol.reason || "market_model_blocked";
    blockingField = "marketModelPolicy";
  } else if (!prompt.length) {
    canExecute = false;
    reason = "empty_prompt";
    blockingField = "prompt";
  }

  const featureFlags = input && input.featureFlags;
  if (canExecute && featureFlags && featureFlags.ai_enabled === false) {
    canExecute = false;
    reason = "feature_flag_ai_disabled";
    blockingField = "featureAiEnabled";
  }
  const settings = input && input.settings;
  if (canExecute && settings && settings.allowAI === false) {
    canExecute = false;
    reason = "settings_allow_ai_disabled";
    blockingField = "settingsAllowAI";
  }

  const featureAiEnabled =
    featureFlags && Object.prototype.hasOwnProperty.call(featureFlags, "ai_enabled")
      ? featureFlags.ai_enabled
      : null;
  const settingsAllowAI =
    settings && Object.prototype.hasOwnProperty.call(settings, "allowAI") ? settings.allowAI : null;

  logger.info({
    event: "ai_gate_evaluation",
    requestId: input && input.requestId != null ? input.requestId : null,
    userId: input && input.userId != null ? String(input.userId) : "",
    canExecute,
    reason,
    blockingField: canExecute ? null : blockingField,
    planAllowsAi: planOk,
    quotaHasHeadroom: quotaOk,
    modelAllowed: modelOk,
    featureAiEnabled,
    settingsAllowAI,
    provider,
    model,
    hasKey,
    hasProviderKey: hasKey,
    allowlistApplied,
    entitlementSummary: {
      plan: ent && ent.plan,
      status: ent && ent.status,
      quota: ent && ent.quota,
      used: ent && ent.used
    }
  });

  const fallbackStrategy = canExecute ? "fallback_on_provider_error" : "mock";

  logger.info({ event: "ai_route_provider_gate", provider, hasKey, reason });

  return {
    provider,
    model,
    route: "default",
    reason,
    canExecute,
    fallbackStrategy
  };
}

module.exports = {
  previewRoute,
  entitlementAllowsAi,
  planAllowsAi,
  quotaHasHeadroom,
  modelAllowedForEntitlement,
  marketModelPolicy,
  providerHasApiKey,
  defaultModelForProvider,
  resolveChatComplete,
  apiKeyForProvider,
  normalizeAiProvider
};
