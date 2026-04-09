/**
 * F-1：ExecutionPlan 在推进循环中的纯函数辅助（便于单测与 runExecutionPlan 复用）。
 */
import type { ExecutionPlan, ExecutionPlanStep } from "../../modules/workbench/execution/executionPlanTypes";
import { isLocalExecutionStepType } from "../../modules/workbench/execution/executionPlanTypes";
import type { TaskStep } from "../../modules/workbench/planner/taskPlanTypes";
import type { ResultProvenance, TaskResult } from "../../modules/result/resultTypes";
import { pipelineAggregateSummaryZh } from "../../modules/result/resultProvenanceUi";
import {
  capabilityStepTaskResultSource,
  localRuntimeStepTaskResultSource,
  computeOutputTrustFromDistinctSources,
  hasNonAuthenticOutput,
  primaryAggregateResultSource,
  provenanceAuthenticityFromDistinctSources,
  resultSourceForExecutionPlanContribution
} from "../../modules/result/resultSourcePolicy";
import { lrPlanStepAggregateHeader } from "../../modules/workbench/execution/localRuntimeNomenclature.zh";

export function mapExecutionPlanStepStatus(
  plan: ExecutionPlan,
  stepIndex: number,
  patch: Partial<ExecutionPlanStep>
): ExecutionPlan {
  return {
    ...plan,
    steps: plan.steps.map((s, i) => (i === stepIndex ? { ...s, ...patch } : s))
  };
}

export function orderedStepResultsForExecutionPlan(
  plan: ExecutionPlan,
  stepResults: Record<string, TaskResult>
): TaskResult[] {
  return plan.steps.map((s) => stepResults[s.stepId]).filter((x): x is TaskResult => x != null);
}

/** 供 ContentExecutor 使用的最小 TaskStep 镜像（非 capability / 非 local） */
export function toContentTaskStepForExecutor(step: ExecutionPlanStep): TaskStep {
  if (step.type === "capability") {
    throw new Error("toContentTaskStepForExecutor:cannot_map_capability");
  }
  if (isLocalExecutionStepType(step.type)) {
    throw new Error("toContentTaskStepForExecutor:cannot_map_local");
  }
  const contentAction =
    step.type === "summarize"
      ? "summarize_result"
      : step.input.contentAction === "summarize_result"
        ? "summarize_result"
        : "generate";
  return {
    id: step.stepId,
    type: "content",
    contentAction,
    title: step.title,
    status: "running",
    producesResult: true,
    metadata: { ...step.input, ...step.metadata }
  };
}

/** F-2A：capability 成功结果 → 统一 TaskResult（供 summarize / 汇总消费） */
export function taskResultFromCapabilityStep(
  step: ExecutionPlanStep,
  title: string,
  body: string,
  summary: string
): TaskResult {
  return {
    kind: "content",
    title,
    body,
    summary,
    action: "capability",
    resultSource: capabilityStepTaskResultSource(),
    metadata: {
      capabilityType: step.input.capabilityType,
      operation: step.input.operation
    }
  };
}

export function taskResultFromLocalRuntimeStep(
  step: ExecutionPlanStep,
  title: string,
  body: string,
  summary: string
): TaskResult {
  return {
    kind: "content",
    title,
    body,
    summary,
    action: "local_runtime",
    resultSource: localRuntimeStepTaskResultSource(),
    metadata: { localStepType: step.type }
  };
}

export function aggregateExecutionStepResults(
  plan: ExecutionPlan,
  stepResults: Record<string, TaskResult>
): TaskResult | null {
  const chunks: string[] = [];
  const contributions: ResultProvenance["steps"] = [];
  for (const st of plan.steps) {
    if (
      st.type !== "generate" &&
      st.type !== "summarize" &&
      st.type !== "capability" &&
      !isLocalExecutionStepType(st.type)
    ) {
      continue;
    }
    const r = stepResults[st.stepId];
    if (r?.kind === "content") {
      const src = resultSourceForExecutionPlanContribution(st, r);
      contributions.push({ stepId: st.stepId, stepType: st.type, source: src });
      const body = (r.body || r.summary || "").trim();
      if (body || (r.title || "").trim()) {
        const header =
          st.type === "capability"
            ? `[能力 · ${String(st.input.capabilityType)} · ${String(st.input.operation)}] ${(r.title || st.title).trim()}`
            : isLocalExecutionStepType(st.type)
              ? lrPlanStepAggregateHeader(st.type, (r.title || "").trim(), st.title.trim())
              : (r.title || st.title).trim();
        chunks.push(`### ${header}\n\n${body || r.summary || ""}`);
      }
    }
  }
  if (!chunks.length) return null;
  const distinctSources = [...new Set(contributions.map((c) => c.source))];
  const authenticity = provenanceAuthenticityFromDistinctSources(distinctSources);
  const resultSource = primaryAggregateResultSource(distinctSources);
  const outputTrust = computeOutputTrustFromDistinctSources(distinctSources);
  const resultProvenance: ResultProvenance = {
    steps: contributions,
    distinctSources,
    authenticity
  };
  const hasNonAuthenticSources = hasNonAuthenticOutput(outputTrust);
  return {
    kind: "content",
    title: "执行结果汇总",
    body: chunks.join("\n\n---\n\n"),
    summary: pipelineAggregateSummaryZh(outputTrust),
    action: "pipeline_aggregate",
    resultSource,
    metadata: {
      resultProvenance,
      hasNonAuthenticSources,
      outputTrust
    }
  };
}
