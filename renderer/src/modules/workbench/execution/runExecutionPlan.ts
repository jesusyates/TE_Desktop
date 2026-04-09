/**
 * F-1A / F-2A：顺序执行 ExecutionPlan；按 step.type 分派 generate / summarize / capability / human_confirm。
 */
import { executeContentAction } from "../../content/contentExecutor";
import { toTaskResult } from "../../result/resultAdapters";
import type { TaskResult } from "../../result/resultTypes";
import type { StylePreferencesSnapshot } from "../../../types/stylePreferences";
import type { TemplateExecutionContext } from "../analyzer/taskAnalyzerTypes";
import type { ComputerExecutionEvent } from "../../../types/computerExecution";
import type { ExecutionPlan } from "./executionPlanTypes";
import { isLocalExecutionStepType } from "./executionPlanTypes";
import {
  aggregateExecutionStepResults,
  mapExecutionPlanStepStatus,
  orderedStepResultsForExecutionPlan,
  taskResultFromCapabilityStep,
  taskResultFromLocalRuntimeStep,
  toContentTaskStepForExecutor
} from "../../../execution/session/executionPlanRunHelpers";
import { runLocalExecutionPlanStep } from "../../../services/localRuntimeBridge";
import {
  capabilityStepTaskResultSource,
  localRuntimeStepTaskResultSource,
  resolveContentStepOutputSource
} from "../../result/resultSourcePolicy";
import { runCapabilityStep } from "./runCapabilityStep";

export type RunExecutionPlanOptions = {
  basePrompt: string;
  signal?: AbortSignal;
  stylePreferences?: StylePreferencesSnapshot;
  memoryReferenceLines?: string[];
  templateExecutionContext?: TemplateExecutionContext;
  computerEvents?: ComputerExecutionEvent[] | null;
  onPlanStatus?: (s: ExecutionPlan["status"]) => void;
  onStepUpdate?: (index: number, plan: ExecutionPlan) => void;
};

export type RunExecutionPlanResult = {
  success: boolean;
  plan: ExecutionPlan;
  stepResults: Record<string, TaskResult>;
  aggregated: TaskResult | null;
  /** 进入等待人工确认后提前返回，后续步骤不会执行 */
  haltedForHumanConfirm?: boolean;
  humanConfirmStepIndex?: number;
};

function aborted(sig: AbortSignal | undefined): boolean {
  return Boolean(sig?.aborted);
}

/**
 * 顺序执行；遇错中断。`human_confirm` 进入 `waiting_confirm` 并立即返回（须由 UI 确认后继续，不在本函数内空转）。
 */
export async function runExecutionPlan(
  initial: ExecutionPlan,
  opt: RunExecutionPlanOptions
): Promise<RunExecutionPlanResult> {
  let plan: ExecutionPlan = { ...initial, steps: initial.steps.map((s) => ({ ...s })) };
  const stepResults: Record<string, TaskResult> = {};
  opt.onPlanStatus?.("running");

  for (let idx = 0; idx < plan.steps.length; idx++) {
    if (aborted(opt.signal)) {
      plan = { ...plan, status: "stopped" };
      opt.onPlanStatus?.("stopped");
      return { success: false, plan, stepResults, aggregated: aggregateExecutionStepResults(plan, stepResults) };
    }

    const step = plan.steps[idx]!;

    if (step.type === "human_confirm") {
      plan = mapExecutionPlanStepStatus(plan, idx, { status: "waiting_confirm" });
      opt.onStepUpdate?.(idx, plan);
      return {
        success: false,
        plan,
        stepResults,
        aggregated: aggregateExecutionStepResults(plan, stepResults),
        haltedForHumanConfirm: true,
        humanConfirmStepIndex: idx
      };
    }

    if (step.type === "capability") {
      plan = mapExecutionPlanStepStatus(plan, idx, { status: "running" });
      opt.onStepUpdate?.(idx, plan);
      const previousResults = orderedStepResultsForExecutionPlan(plan, stepResults);
      const res = runCapabilityStep(step, {
        basePrompt: opt.basePrompt.trim(),
        priorResults: previousResults
      });
      if (!res.ok) {
        plan = mapExecutionPlanStepStatus(plan, idx, { status: "error" });
        plan = { ...plan, status: "error" };
        opt.onPlanStatus?.("error");
        return { success: false, plan, stepResults, aggregated: aggregateExecutionStepResults(plan, stepResults) };
      }
      const capType = String(step.input.capabilityType ?? "");
      const op = String(step.input.operation ?? "");
      const out = {
        kind: "capability" as const,
        source: capabilityStepTaskResultSource(),
        title: res.title,
        body: res.body,
        summary: res.summary,
        capabilityType: capType,
        operation: op
      };
      const unified = taskResultFromCapabilityStep(step, res.title, res.body, res.summary);
      plan = mapExecutionPlanStepStatus(plan, idx, { status: "success", output: out });
      stepResults[step.stepId] = unified;
      opt.onStepUpdate?.(idx, plan);
      continue;
    }

    if (isLocalExecutionStepType(step.type)) {
      plan = mapExecutionPlanStepStatus(plan, idx, { status: "running" });
      opt.onStepUpdate?.(idx, plan);
      const res = await runLocalExecutionPlanStep(step);
      if (!res.ok) {
        plan = mapExecutionPlanStepStatus(plan, idx, { status: "error" });
        plan = { ...plan, status: "error" };
        opt.onPlanStatus?.("error");
        return { success: false, plan, stepResults, aggregated: aggregateExecutionStepResults(plan, stepResults) };
      }
      const unified = taskResultFromLocalRuntimeStep(step, res.title, res.body, res.summary);
      const out = {
        kind: "content" as const,
        source: localRuntimeStepTaskResultSource(),
        title: res.title,
        body: res.body,
        summary: res.summary,
        action: "local_runtime"
      };
      plan = mapExecutionPlanStepStatus(plan, idx, { status: "success", output: out });
      stepResults[step.stepId] = unified;
      opt.onStepUpdate?.(idx, plan);
      continue;
    }

    if (step.type !== "generate" && step.type !== "summarize") {
      plan = mapExecutionPlanStepStatus(plan, idx, { status: "error" });
      plan = { ...plan, status: "error" };
      opt.onPlanStatus?.("error");
      return { success: false, plan, stepResults, aggregated: aggregateExecutionStepResults(plan, stepResults) };
    }

    plan = mapExecutionPlanStepStatus(plan, idx, { status: "running" });
    opt.onStepUpdate?.(idx, plan);

    const previousResults = orderedStepResultsForExecutionPlan(plan, stepResults);
    const planStep = toContentTaskStepForExecutor(step);

    const stepPrompt =
      step.type === "summarize"
        ? `${opt.basePrompt.trim()}\n\n【总结步骤：${step.title}】\n${step.description}\n\n本步仅依据前序步骤已产出内容做摘要、压缩与结构化整理，不得当作全新主题扩写。`
        : `${opt.basePrompt.trim()}\n\n【流水线步骤：${step.title}】\n${step.description}`;

    try {
      const raw = await executeContentAction({
        action: step.type === "summarize" ? "summarize_result" : "generate",
        prompt: stepPrompt,
        planStep,
        previousResults,
        computerEvents: opt.computerEvents,
        stylePreferences: opt.stylePreferences,
        memoryReferenceLines: opt.memoryReferenceLines,
        templateExecutionContext: opt.templateExecutionContext
      });
      const unified = toTaskResult(raw);
      if (!unified) {
        plan = mapExecutionPlanStepStatus(plan, idx, { status: "error" });
        plan = { ...plan, status: "error" };
        opt.onPlanStatus?.("error");
        return { success: false, plan, stepResults, aggregated: aggregateExecutionStepResults(plan, stepResults) };
      }
      const src = resolveContentStepOutputSource(unified, raw);
      const out = {
        kind: "content" as const,
        source: src,
        title: raw.title,
        body: raw.body,
        summary: raw.summary,
        action: raw.action
      };
      plan = mapExecutionPlanStepStatus(plan, idx, { status: "success", output: out });
      stepResults[step.stepId] = unified;
      opt.onStepUpdate?.(idx, plan);
    } catch {
      plan = mapExecutionPlanStepStatus(plan, idx, { status: "error" });
      plan = { ...plan, status: "error" };
      opt.onPlanStatus?.("error");
      return { success: false, plan, stepResults, aggregated: aggregateExecutionStepResults(plan, stepResults) };
    }
  }

  plan = { ...plan, status: "success" };
  opt.onPlanStatus?.("success");
  return {
    success: true,
    plan,
    stepResults,
    aggregated: aggregateExecutionStepResults(plan, stepResults)
  };
}
