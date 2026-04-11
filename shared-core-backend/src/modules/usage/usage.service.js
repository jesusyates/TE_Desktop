/**
 * Usage 计量：仅 ai_result 后写入；失败只打日志。
 */
const { config } = require("../../infra/config");
const { logger } = require("../../infra/logger");
const { getUsageStore } = require("../../stores/registry");
const { getStorageDimensions } = require("../../infra/context-dimensions");
const { getQuotaStoreInstance } = require("../../stores/quota/quota.store");
const entitlementAccountStore = require("../../stores/account/entitlement.store");
const { normalizeUsageRecord } = require("../../schemas/usage.schema");

function estimateCost(totalTokens) {
  const c = config();
  const rate = Number(c.usageCostPer1kTokens) || 0;
  const t = Math.max(0, Number(totalTokens) || 0);
  return Math.round((t / 1000) * rate * 1e6) / 1e6;
}

/**
 * @param {import('express').Request['context']} ctx
 */
async function listUsageForApi(ctx) {
  const { userKey } = require("../../schemas/domain-stores.schema");
  const uid = userKey(ctx);
  const store = getUsageStore();
  const rows = await store.listByUser(uid, 200, ctx.requestId || null);
  return (rows || []).map((r) => normalizeUsageRecord(r)).filter(Boolean);
}

/**
 * @param {import('express').Request['context']} ctx
 * @param {object} opts
 */
async function recordAiUsage(ctx, opts) {
  const execPack = opts.execPack;
  const ai = execPack && execPack.aiPayload;
  if (!ai || !ai.usage || typeof ai.usage !== "object") return;

  const totalTokens = Math.max(0, Number(ai.usage.totalTokens) || 0);
  const inputTokens = Math.max(0, Number(ai.usage.inputTokens) || 0);
  const outputTokens = Math.max(0, Number(ai.usage.outputTokens) || 0);
  const cost = estimateCost(totalTokens);
  const userId = String(opts.userId || "").trim();
  const runId = String(opts.runId || "").trim();
  const product = String(opts.product || config().defaultProduct || "aics")
    .trim()
    .toLowerCase();
  const requestId = opts.requestId != null ? String(opts.requestId) : ctx.requestId || null;
  const dims = getStorageDimensions(ctx);
  const market = opts.market != null ? String(opts.market) : dims.market;
  const locale = opts.locale != null ? String(opts.locale) : dims.locale;

  const t0 = Date.now();
  try {
    const store = getUsageStore();
    await store.create(
      {
        userId,
        runId,
        provider: ai.provider || "openai",
        model: ai.model || "",
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        market,
        locale,
        product
      },
      requestId
    );
    logger.info({
      event: "usage_recorded",
      userId,
      runId,
      tokens: totalTokens,
      cost,
      remaining: null,
      success: true,
      durationMs: Date.now() - t0
    });
  } catch (e) {
    logger.warn({
      event: "usage_recorded",
      userId,
      runId,
      tokens: totalTokens,
      cost,
      success: false,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - t0
    });
    return;
  }

  const t1 = Date.now();
  const meta = {
    task_id: runId,
    market: ctx.market != null ? String(ctx.market) : null,
    locale: ctx.locale != null ? String(ctx.locale) : null,
    client_platform: ctx.platform != null ? String(ctx.platform) : null
  };
  const cons = getQuotaStoreInstance().consumeTokens(userId, product, totalTokens, meta);
  if (cons.ok) {
    const ent = cons.entitlement;
    const remaining =
      ent && Number.isFinite(Number(ent.quota)) && Number.isFinite(Number(ent.used))
        ? Math.max(0, Number(ent.quota) - Number(ent.used))
        : null;
    logger.info({
      event: "quota_updated",
      userId,
      runId,
      tokens: totalTokens,
      cost,
      remaining,
      success: true,
      durationMs: Date.now() - t1
    });
    entitlementAccountStore.scheduleEntitlementCloudMirror(userId, product, requestId);
  } else {
    logger.warn({
      event: "quota_updated",
      userId,
      runId,
      tokens: totalTokens,
      cost,
      remaining: null,
      success: false,
      code: cons.code,
      durationMs: Date.now() - t1
    });
  }
}

module.exports = { listUsageForApi, recordAiUsage, estimateCost };
