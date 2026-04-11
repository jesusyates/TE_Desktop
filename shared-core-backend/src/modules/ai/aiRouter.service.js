/**
 * AI Router 最小版：单 provider / 单模型，仅判定与元信息。
 */
const { config } = require("../../infra/config");

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
  if (String(ent.status || "").toLowerCase() !== "active") return false;
  const plan = String(ent.plan || "free").toLowerCase();
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
function previewRoute(input) {
  const c = config();
  const provider = String(c.aiProviderDefault || "openai").toLowerCase();
  let model = String(c.aiModelDefault || "gpt-4o-mini");
  const prompt = String((input && input.userPrompt) || "").trim();
  const hasKey = Boolean(c.openaiApiKey && String(c.openaiApiKey).trim() !== "");
  const risk = String((input && input.riskLevel) || "L0");
  const ent = input && input.entitlement;
  const planOk = planAllowsAi(ent);
  const quotaOk = quotaHasHeadroom(ent);
  const market = input && input.market != null ? String(input.market) : null;
  const mktPol = marketModelPolicy(market, model);
  model = mktPol.model;
  const modelOk = modelAllowedForEntitlement(ent, model, c.aiModelDefault);

  let reason = "default_minimal_route";
  let canExecute =
    hasKey &&
    planOk &&
    quotaOk &&
    modelOk &&
    mktPol.allowed &&
    risk !== "L4" &&
    prompt.length > 0;

  if (!hasKey) {
    canExecute = false;
    reason = "missing_openai_key";
  } else if (risk === "L4") {
    canExecute = false;
    reason = "risk_level_l4_blocked";
  } else if (!planOk) {
    canExecute = false;
    reason = "entitlement_blocked";
  } else if (!quotaOk) {
    canExecute = false;
    reason = "quota_exceeded";
  } else if (!modelOk) {
    canExecute = false;
    reason = "model_not_allowed";
  } else if (!mktPol.allowed) {
    canExecute = false;
    reason = mktPol.reason || "market_model_blocked";
  } else if (!prompt.length) {
    canExecute = false;
    reason = "empty_prompt";
  }

  const featureFlags = input && input.featureFlags;
  if (canExecute && featureFlags && featureFlags.ai_enabled === false) {
    canExecute = false;
    reason = "feature_flag_ai_disabled";
  }
  const settings = input && input.settings;
  if (canExecute && settings && settings.allowAI === false) {
    canExecute = false;
    reason = "settings_allow_ai_disabled";
  }

  const fallbackStrategy = canExecute ? "fallback_on_provider_error" : "mock";

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
  marketModelPolicy
};
