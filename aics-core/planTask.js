/**
 * D-7-3D：与桌面端 taskPlanner.ts 规则对齐（无模型、无 Safety）。
 */
const { analyzeTaskCore } = require("./analyzeTask");

function isHighRiskPrompt(prompt) {
  return /删除|覆盖|清空|批量删除|\bremove\b|\bdelete\b|\boverwrite\b/i.test(prompt);
}

function finalizeLinearPlanSteps(steps) {
  const withIds = steps.map((s, i) => ({ ...s, id: `step_${i}` }));
  return withIds.map((s, i) => ({
    ...s,
    dependsOnStepId: i === 0 ? null : withIds[i - 1].id
  }));
}

function buildHumanConfirmStep() {
  return {
    id: "tmp",
    type: "human",
    humanAction: "confirm",
    title: "等待用户确认",
    message: "该任务可能涉及高风险操作，确认后继续执行。",
    status: "pending",
    producesResult: false
  };
}

function buildCapabilityPlanStep(capabilityId, analysis, title) {
  return {
    id: "tmp",
    type: "capability",
    capabilityId,
    title: title ?? capabilityId,
    status: "pending",
    producesResult: true,
    resultKey: `capability.${capabilityId.replace(/\./g, "_")}`,
    metadata: analysis.metadata ? { ...analysis.metadata } : undefined,
    onErrorNextStepId: null
  };
}

function buildContentPlanStep(contentAction, title) {
  return {
    id: "tmp",
    type: "content",
    contentAction,
    title,
    status: "pending",
    producesResult: true,
    resultKey: `content.${contentAction}`
  };
}

function buildLinearCapabilityChainPlan(analysis, capabilityIds, tail) {
  const steps = [];
  if (isHighRiskPrompt(analysis.rawPrompt)) {
    steps.push(buildHumanConfirmStep());
  }
  for (const id of capabilityIds) {
    const label = id === "file.organize" ? "整理文件" : id;
    steps.push(buildCapabilityPlanStep(id, analysis, label));
  }
  steps.push(buildContentPlanStep(tail.contentAction, tail.title));
  return {
    id: "plan_1",
    steps: finalizeLinearPlanSteps(steps)
  };
}

function buildOrganizePlan(analysis) {
  return buildLinearCapabilityChainPlan(analysis, ["file.organize"], {
    contentAction: "summarize_result",
    title: "生成整理摘要"
  });
}

function planTaskCore(analysis) {
  if (analysis.intent === "organize_files") {
    return buildOrganizePlan(analysis);
  }

  return {
    id: "plan_1",
    steps: finalizeLinearPlanSteps([buildContentPlanStep("generate", "生成内容")])
  };
}

/**
 * 请求体已有合法 analysis 则直接用；否则需要 body.prompt 并走 analyzeTaskCore。
 * @returns {object | null} analysis 或 null
 */
function resolveAnalysisForPlan(body) {
  const a = body.analysis;
  if (a && typeof a === "object" && typeof a.rawPrompt === "string") {
    const intent = a.intent;
    if (
      intent === "organize_files" ||
      intent === "unknown" ||
      intent === "local_directory_scan" ||
      intent === "local_text_file_read" ||
      intent === "local_text_transform"
    ) {
      return {
        rawPrompt: a.rawPrompt,
        normalizedPrompt:
          typeof a.normalizedPrompt === "string" ? a.normalizedPrompt : String(a.rawPrompt).toLowerCase(),
        requestedMode:
          a.requestedMode === "content" || a.requestedMode === "computer" ? a.requestedMode : "auto",
        resolvedMode:
          a.resolvedMode === "content" || a.resolvedMode === "computer" ? a.resolvedMode : "content",
        intent,
        candidateCapabilities: Array.isArray(a.candidateCapabilities) ? a.candidateCapabilities : [],
        shouldExecute: typeof a.shouldExecute === "boolean" ? a.shouldExecute : false,
        metadata: a.metadata && typeof a.metadata === "object" ? a.metadata : undefined,
        stylePreferences:
          a.stylePreferences && typeof a.stylePreferences === "object" ? a.stylePreferences : undefined
      };
    }
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return null;
  return analyzeTaskCore(body);
}

module.exports = {
  planTaskCore,
  resolveAnalysisForPlan,
  finalizeLinearPlanSteps
};
