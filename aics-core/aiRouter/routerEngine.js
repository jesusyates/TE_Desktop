const { selectModelKey } = require("./routingRules.js");
const { MODEL_REGISTRY } = require("./modelRegistry.js");

/**
 * analyze 链路用低温短输出；plan 等用默认。
 * 规范字面量为 taskType==="analysis"，此处用 stage 表达，避免与路由语义 taskType（local/cloud）冲突。
 * @param {{ taskType: string; complexity: string; allowCloud: boolean; stage: "analysis" | "plan" }} input
 */
function buildParams(input) {
  if (input.stage === "analysis") {
    return { temperature: 0.2, maxTokens: 1200 };
  }
  return { temperature: 0.7, maxTokens: 2000 };
}

/**
 * @param {{ taskType: string; complexity: string; allowCloud: boolean; stage: "analysis" | "plan" }} input
 */
function runAiRouter(input) {
  const modelKey = selectModelKey(input);
  const registryModel = MODEL_REGISTRY[modelKey] || MODEL_REGISTRY.local;

  return {
    executionMode: modelKey === "local" ? "local_only" : "cloud_ai",
    model: registryModel,
    params: buildParams(input),
    reason: `router:${modelKey}|${input.taskType}|${input.complexity}`,
    fallback: {
      mode: "local_only"
    }
  };
}

module.exports = { runAiRouter };
