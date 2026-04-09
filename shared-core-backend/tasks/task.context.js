/**
 * C-4 — task_context / run_context 装配（字段名统一；禁止平台当 market）。
 * 禁止：runTask 内再读 req/headers 覆盖身份。
 */
const { contextLog } = require("../context/context.log");

function buildTaskContext(requestContext) {
  const task_context = {
    user_id: requestContext.userId,
    market: requestContext.market,
    locale: requestContext.locale,
    product: requestContext.product,
    client_platform: requestContext.platform
  };
  contextLog({
    event: "task_context_attached",
    user_id: task_context.user_id,
    market: task_context.market,
    locale: task_context.locale,
    product: task_context.product,
    client_platform: task_context.client_platform
  });
  return task_context;
}

/**
 * @param {object} requestContext req.context（须含 entitlement）
 */
function buildRunContext(requestContext) {
  if (!requestContext.entitlement || typeof requestContext.entitlement !== "object") {
    throw new Error("run_context_requires_entitlement");
  }
  return {
    user_id: requestContext.userId,
    market: requestContext.market,
    locale: requestContext.locale,
    product: requestContext.product,
    client_platform: requestContext.platform,
    entitlement: {
      plan: requestContext.entitlement.plan,
      quota: requestContext.entitlement.quota,
      used: requestContext.entitlement.used
    }
  };
}

module.exports = { buildTaskContext, buildRunContext };
