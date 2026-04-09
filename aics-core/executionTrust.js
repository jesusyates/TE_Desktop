/**
 * Trust & Data Safety v1：与桌面 `modules/trust` 规则对齐（Execution 入口输出）。
 */
const { sanitizeMemoryHints } = require("./analyzeTask");

/** @param {unknown} plan */
function planUsesCloudAi(plan) {
  const steps = plan && typeof plan === "object" && Array.isArray(plan.steps) ? plan.steps : [];
  return steps.some(
    (s) =>
      s &&
      typeof s === "object" &&
      s.type === "content" &&
      (s.contentAction === "generate" || s.contentAction === "summarize_result")
  );
}

/** @param {unknown} plan */
function planHasCapabilitySteps(plan) {
  const steps = plan && typeof plan === "object" && Array.isArray(plan.steps) ? plan.steps : [];
  return steps.some((s) => s && typeof s === "object" && s.type === "capability");
}

/** @param {unknown} plan */
function computeFlowType(plan) {
  const cloud = planUsesCloudAi(plan);
  const cap = planHasCapabilitySteps(plan);
  if (cloud && cap) return "mixed";
  if (cloud) return "cloud";
  if (cap) return "local";
  return "local";
}

/**
 * v1：local_to_cloud → L2；store_memory（memoryHints 注入）→ L1；云端优先覆盖等级。
 * @param {unknown} plan
 * @param {unknown} memoryHintsRaw
 */
function computeExecutionTrustV1(plan, memoryHintsRaw) {
  /** @type {string[]} */
  const riskReasons = [];
  let riskLevel = "L0";

  const mem = sanitizeMemoryHints(memoryHintsRaw);
  if (mem) {
    riskReasons.push("store_memory");
    riskLevel = "L1";
  }

  if (planUsesCloudAi(plan)) {
    riskReasons.push("local_to_cloud");
    riskLevel = "L2";
  }

  return {
    flowType: computeFlowType(plan),
    riskLevel,
    riskReasons
  };
}

/**
 * 仅 analyze 阶段：尚无 plan，只评估 memoryHints（与桌面 fallback 一致）。
 * @param {unknown} memoryHintsRaw
 */
function computeExecutionTrustAnalyzeOnly(memoryHintsRaw) {
  /** @type {string[]} */
  const riskReasons = [];
  let riskLevel = "L0";
  const mem = sanitizeMemoryHints(memoryHintsRaw);
  if (mem) {
    riskReasons.push("store_memory");
    riskLevel = "L1";
  }
  return {
    flowType: "local",
    riskLevel,
    riskReasons
  };
}

module.exports = {
  computeExecutionTrustV1,
  computeExecutionTrustAnalyzeOnly,
  planUsesCloudAi,
  computeFlowType
};
