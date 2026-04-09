/**
 * C-4 / C-8 — Planner 与 Task 共享同一 identity_snapshot（禁止 Planner 内重建身份）。
 */
const { randomUUID } = require("crypto");
const { contextLog } = require("../context/context.log");
const { assertIdentitySnapshot } = require("../context/identity-snapshot.util");

function computePlannerSteps(prompt) {
  const taskPrompt = prompt == null || String(prompt).trim() === "" ? "未命名任务" : String(prompt).trim();
  return [
    { title: "生成创意", stepOrder: 1, action: "generate-content", input: { stage: "idea", prompt: taskPrompt } },
    { title: "生成脚本", stepOrder: 2, action: "generate-content", input: { stage: "script", prompt: taskPrompt } },
    { title: "生成标题", stepOrder: 3, action: "transform-data", input: { stage: "title", prompt: taskPrompt } },
    { title: "生成标签", stepOrder: 4, action: "transform-data", input: { stage: "tags", prompt: taskPrompt } },
    { title: "回写记忆", stepOrder: 5, action: "save-memory", input: { stage: "memory", prompt: taskPrompt } }
  ];
}

function buildPlannerIdentityContext(requestContext) {
  return {
    user_id: requestContext.userId,
    market: requestContext.market,
    locale: requestContext.locale,
    product: requestContext.product,
    client_platform: requestContext.platform
  };
}

/**
 * @param {{ context: object, identity_snapshot: object, input: { prompt?: string } }} args
 */
function planTasks({ context, identity_snapshot, input }) {
  const assert = assertIdentitySnapshot(identity_snapshot, { allowNullEntitlement: true });
  if (!assert.ok) {
    const err = new Error("identity_snapshot_invalid");
    err.code = "identity_snapshot_invalid";
    throw err;
  }
  const plannerCtx = buildPlannerIdentityContext(context);
  contextLog({
    event: "planner_context_attached",
    user_id: plannerCtx.user_id,
    market: plannerCtx.market,
    locale: plannerCtx.locale,
    product: plannerCtx.product,
    client_platform: plannerCtx.client_platform
  });
  const prompt = input && input.prompt != null ? input.prompt : "";
  const taskPrompt = String(prompt).trim() || "未命名任务";
  return { taskId: randomUUID(), steps: computePlannerSteps(taskPrompt) };
}

module.exports = { planTasks, computePlannerSteps, buildPlannerIdentityContext };
