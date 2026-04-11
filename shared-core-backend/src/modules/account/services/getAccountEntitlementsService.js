const { config } = require("../../../infra/config");
const { AppError } = require("../../../utils/AppError");
const entitlementAccountStore = require("../../../stores/account/entitlement.store");
const { normalizeEntitlementSummary } = require("../schemas/entitlementSummarySchema");

/**
 * @param {import('express').Request['context']} ctx
 */
async function getAccountEntitlementsService(ctx) {
  if (!ctx || ctx.userId == null || String(ctx.userId).trim() === "") {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401);
  }
  const c = config();
  const product = String(ctx.product || c.defaultProduct || "aics")
    .trim()
    .toLowerCase();
  if (!product) {
    throw new AppError("VALIDATION_ERROR", "Product context required for entitlements", 400);
  }

  const row = await entitlementAccountStore.getForProduct(
    ctx.userId,
    product,
    ctx.requestId || null
  );
  if (!row) {
    throw new AppError("INTERNAL_ERROR", "Entitlement load failed", 500);
  }

  const quotaLimit = Number(row.quota);
  const used = Number(row.used);
  const remaining =
    Number.isFinite(quotaLimit) && Number.isFinite(used) ? Math.max(0, quotaLimit - used) : 0;

  return normalizeEntitlementSummary({
    plan: row.plan,
    entitlements: { status: row.status },
    quota: {
      limit: quotaLimit,
      used,
      remaining
    },
    usage: {
      consumed: used
    },
    featureFlags: {},
    updatedAt: row.updated_at || row.updatedAt || null,
    createdAt: row.created_at || row.createdAt || null
  });
}

module.exports = { getAccountEntitlementsService };
