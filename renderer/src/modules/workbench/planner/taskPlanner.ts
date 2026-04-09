import type { MemoryHints } from "../../memory/memoryQuery";
import type { TaskAnalysisResult } from "../analyzer/taskAnalyzerTypes";
import type { ContentActionId } from "../../content/contentActionTypes";
import type { TaskPlan, TaskStep } from "./taskPlanTypes";
import type { ExecutionPlan } from "../execution/executionPlanTypes";
import { buildExecutionPlanFromAnalysis } from "../execution/executionPlanBuilder";

function isHighRiskPrompt(prompt: string): boolean {
  return /删除|覆盖|清空|批量删除|\bremove\b|\bdelete\b|\boverwrite\b/i.test(prompt);
}

/** 统一为 step_0…step_n，并施加线性 dependsOnStepId（为后续 DAG 铺路） */
export function finalizeLinearPlanSteps(steps: TaskStep[]): TaskStep[] {
  const withIds = steps.map((s, i) => ({ ...s, id: `step_${i}` }));
  return withIds.map((s, i) => ({
    ...s,
    dependsOnStepId: i === 0 ? null : withIds[i - 1]!.id
  }));
}

function buildHumanConfirmStep(): TaskStep {
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

function buildCapabilityPlanStep(capabilityId: string, analysis: TaskAnalysisResult, title?: string): TaskStep {
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

function buildContentPlanStep(contentAction: ContentActionId, title: string): TaskStep {
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

/**
 * 线性多 capability + 尾部 content（遗留 TaskPlan 工具；F-1 主路径为 ExecutionPlan）。
 */
export function buildLinearCapabilityChainPlan(
  analysis: TaskAnalysisResult,
  capabilityIds: string[],
  tail: { contentAction: ContentActionId; title: string }
): TaskPlan {
  const steps: TaskStep[] = [];
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

/**
 * F-1A：返回标准 ExecutionPlan（语义 generate → summarize；不再靠多段 generate 冒充流水线）。
 */
export function planTask(
  analysis: TaskAnalysisResult,
  options?: { memoryHints?: MemoryHints; taskId?: string }
): ExecutionPlan {
  void options?.memoryHints;
  const tid = options?.taskId?.trim() || `task_${Date.now().toString(36)}`;
  return buildExecutionPlanFromAnalysis(analysis, tid, "plan_1");
}
