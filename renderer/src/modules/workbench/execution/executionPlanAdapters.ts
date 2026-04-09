/**
 * F-1：Core / 旧 TaskPlan 与新 ExecutionPlan 的互转。
 */
import type { TaskPlan, TaskStep } from "../planner/taskPlanTypes";
import { finalizeLinearPlanSteps } from "../planner/taskPlanner";
import type { ExecutionPlan, ExecutionPlanStep } from "./executionPlanTypes";
import { isLocalExecutionStepType } from "./executionPlanTypes";
import { buildExecutionPlanFromAnalysis } from "./executionPlanBuilder";
import type { TaskAnalysisResult } from "../analyzer/taskAnalyzerTypes";

function taskStepToExecutionStep(st: TaskStep, index: number): ExecutionPlanStep {
  if (st.type === "human") {
    const msg = st.message?.trim() || "";
    return {
      stepId: st.id || `step_${index}`,
      type: "human_confirm",
      title: st.title?.trim() || "确认",
      description: msg,
      status: st.status,
      input: {},
      output: null,
      humanMessage: msg,
      metadata: st.metadata ? { ...st.metadata } : undefined
    };
  }
  if (st.type === "content") {
    const isSummarize = st.contentAction === "summarize_result";
    return {
      stepId: st.id || `step_${index}`,
      type: isSummarize ? "summarize" : "generate",
      title: st.title?.trim() || (isSummarize ? "摘要整理" : "内容生成"),
      description: isSummarize
        ? "基于前序执行结果生成摘要、压缩与结构化整理。"
        : "根据用户任务进行内容生成与展开。",
      status: st.status,
      input: isSummarize ? {} : { contentAction: st.contentAction ?? "generate" },
      output: null,
      metadata: st.metadata ? { ...st.metadata } : undefined
    };
  }
  if (st.type === "capability") {
    const meta = st.metadata as Record<string, unknown> | undefined;
    const isF2 =
      meta?.f2Capability === true &&
      typeof meta.capabilityType === "string" &&
      typeof meta.operation === "string";
    if (isF2) {
      return {
        stepId: st.id || `step_${index}`,
        type: "capability",
        title: st.title?.trim() || "能力步骤",
        description: "F-2A 本地内容能力（无网络、无系统调用）。",
        status: st.status,
        input: {
          capabilityType: meta.capabilityType,
          operation: meta.operation,
          ...(typeof meta.payload === "object" && meta.payload !== null ? { payload: meta.payload } : {})
        },
        output: null,
        metadata: st.metadata ? { ...st.metadata } : undefined
      };
    }
  }
  return {
    stepId: st.id || `step_${index}`,
    type: "generate",
    title: st.title?.trim() || st.capabilityId || "能力步骤",
    description: `本阶段以内容生成承接原计划能力「${st.capabilityId ?? "unknown"}」。（F-1 未接本地自动化）`,
    status: st.status,
    input: { deferredCapabilityId: st.capabilityId },
    output: null,
    metadata: st.metadata ? { ...st.metadata } : undefined
  };
}

/**
 * Core / 历史 TaskPlan → ExecutionPlan。
 * F-1A：不再将单 generate 机械拆成多段；多步语义由计划中显式步骤表达。
 */
export function liftTaskPlanToExecutionPlan(taskPlan: TaskPlan, taskId: string): ExecutionPlan {
  const execSteps = taskPlan.steps
    .map((s, i) => taskStepToExecutionStep(s, i))
    .map((s, i) => ({ ...s, stepId: `step_${i}`, status: "pending" as const }));
  return {
    planId: taskPlan.id || "plan_core",
    taskId,
    status: "pending",
    steps: execSteps
  };
}

/** 供 Core /safety-check 等仍接收 TaskPlan 的接口：镜像（仅结构提示） */
export function executionPlanToTaskPlanMirror(plan: ExecutionPlan): TaskPlan {
  const steps: TaskStep[] = plan.steps.map((s) => {
    if (s.type === "human_confirm") {
      return {
        id: s.stepId,
        type: "human",
        humanAction: "confirm",
        title: s.title,
        message: s.humanMessage ?? s.description,
        status: "pending",
        producesResult: false,
        metadata: s.metadata
      };
    }
    if (isLocalExecutionStepType(s.type)) {
      return {
        id: s.stepId,
        type: "capability",
        capabilityId: `local.${s.type}`,
        title: s.title,
        status: "pending",
        producesResult: true,
        metadata: {
          localRuntime: true,
          localStepType: s.type,
          ...s.input,
          ...s.metadata
        }
      };
    }
    if (s.type === "capability") {
      return {
        id: s.stepId,
        type: "capability",
        capabilityId: "f2.local.content",
        title: s.title,
        status: "pending",
        producesResult: true,
        metadata: {
          f2Capability: true,
          capabilityType: s.input.capabilityType,
          operation: s.input.operation,
          payload: s.input.payload,
          ...s.metadata
        }
      };
    }
    if (s.type === "summarize") {
      return {
        id: s.stepId,
        type: "content",
        contentAction: "summarize_result",
        title: s.title,
        status: "pending",
        producesResult: true,
        metadata: { ...s.input, ...s.metadata }
      };
    }
    return {
      id: s.stepId,
      type: "content",
      contentAction: (s.input.contentAction as "generate" | undefined) ?? "generate",
      title: s.title,
      status: "pending",
      producesResult: true,
      metadata: { ...s.input, ...s.metadata }
    };
  });
  return { id: plan.planId, steps: finalizeLinearPlanSteps(steps) };
}

/** 与 {@link planTask} 对齐的入口：分析 → ExecutionPlan（供单测 / 工具） */
export function planExecutionFromAnalysis(
  analysis: TaskAnalysisResult,
  taskId: string
): ExecutionPlan {
  return buildExecutionPlanFromAnalysis(analysis, taskId);
}
