/**
 * Controller v1 — 规则引擎（非 LLM、非 Agent）。
 */
const { normalizeControllerDecision, clipGoal } = require("../../schemas/controller.v1.schema");

const RESEARCH_RE = /检索|总结|资料|搜索|调研|查阅|收集|research|survey|lookup|search/i;
const RISK_L2_RE =
  /删除|覆盖|批量修改|上传|写入\s*memory|保存模板|清空|格式化|delete|overwrite|bulk|wipe/i;
/** L4：阻断真实模型调用（越狱/高危指令等） */
const RISK_L4_RE =
  /越狱|jailbreak|ignore\s*(all\s*)?(previous|above)|脱库|拖库|社会工程|钓鱼\s*密码|exfiltrate|dump\s+table|rm\s+-rf\s+\//i;
const MEDIUM_PROMPT_LEN = 800;

/**
 * @param {object} input
 * @param {string} input.userPrompt
 * @param {unknown[]} [input.attachments]
 * @param {unknown|null} [input.templateContext]
 * @param {unknown[]} [input.memoryHints]
 * @param {string|null} [input.market]
 * @param {string|null} [input.locale]
 * @param {object} [input.entitlement]
 */
function decide(input) {
  const userPrompt = String((input && input.userPrompt) || "").trim();
  const attachments = Array.isArray(input && input.attachments) ? input.attachments : [];

  const taskType = RESEARCH_RE.test(userPrompt) ? "research" : "content";
  const complexity =
    userPrompt.length > MEDIUM_PROMPT_LEN || attachments.length > 0 ? "medium" : "simple";
  let riskLevel = "L0";
  if (RISK_L4_RE.test(userPrompt)) riskLevel = "L4";
  else if (RISK_L2_RE.test(userPrompt)) riskLevel = "L2";
  const executionStrategy = complexity === "medium" ? "pipeline" : "direct";

  const persistenceStrategy = {
    /** 执行成功且为 medium 时由 executeTaskService 写入 memory */
    shouldWriteMemory: complexity === "medium",
    shouldSuggestTemplate: complexity === "medium" && taskType === "content"
  };

  const steps =
    executionStrategy === "pipeline"
      ? [
          {
            id: "step_1",
            type: "content",
            status: "pending",
            purpose: "draft content body"
          },
          {
            id: "step_2",
            type: "content",
            status: "pending",
            purpose: "assemble final result"
          }
        ]
      : [
          {
            id: "step_1",
            type: "content",
            status: "pending",
            purpose: "generate result"
          }
        ];

  const goal = clipGoal(userPrompt) || "Complete user request";
  const plan = {
    goal,
    strategy: executionStrategy,
    steps: steps.map((s) => ({ ...s }))
  };

  const raw = {
    taskType,
    complexity,
    riskLevel,
    executionStrategy,
    persistenceStrategy,
    plan,
    steps: plan.steps.map((s) => ({ ...s }))
  };

  return normalizeControllerDecision(raw);
}

module.exports = { decide };
