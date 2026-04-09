import { finalizeLinearPlanSteps } from "../workbench/planner/taskPlanner";
import type { TaskPlan, TaskStep } from "../workbench/planner/taskPlanTypes";
import type { ExecutionPlan, ExecutionPlanStep } from "../workbench/execution/executionPlanTypes";
import { FORBIDDEN_KEYWORDS, HIGH_RISK_KEYWORDS } from "./safetyRules";
import { inferRiskControlFields } from "../../services/riskTierPolicy";
import type { SafetyCheckInput, SafetyCheckResult, SafetyIssue } from "./safetyTypes";

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function collectForbiddenIssues(text: string): SafetyIssue[] {
  const issues: SafetyIssue[] = [];
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      issues.push({
        code: "forbidden_keyword",
        message: `描述中包含可能被禁止的内容：“${kw}”。为保障安全与合规，任务已拦截。`,
        level: "high"
      });
    }
  }
  return issues;
}

function collectHighRiskIssues(text: string): SafetyIssue[] {
  const issues: SafetyIssue[] = [];
  for (const kw of HIGH_RISK_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      issues.push({
        code: "high_risk_keyword",
        message: `检测到可能的高风险操作相关表述：“${kw}”。请确认后继续。`,
        level: "medium"
      });
    }
  }
  return issues;
}

/**
 * 统一安全检查入口：规则版；可扩展为逐 plan.step 扫描。
 */
export function runSafetyCheck(input: SafetyCheckInput): SafetyCheckResult {
  void input.plan;
  void input.context;

  const text = normalizePrompt(input.prompt);

  const forbidden = collectForbiddenIssues(text);
  if (forbidden.length) {
    const level = "high" as const;
    return {
      decision: "block",
      issues: forbidden,
      level,
      reason: forbidden.map((i) => i.message).join(" "),
      codes: forbidden.map((i) => i.code),
      ...inferRiskControlFields("block", level)
    };
  }

  const highRisk = collectHighRiskIssues(text);
  if (highRisk.length) {
    const level = "medium" as const;
    return {
      decision: "confirm",
      issues: highRisk,
      level,
      reason: highRisk.map((i) => i.message).join(" "),
      codes: highRisk.map((i) => i.code),
      ...inferRiskControlFields("confirm", level)
    };
  }

  const level = "low" as const;
  return {
    decision: "allow",
    issues: [],
    level,
    reason: "",
    codes: [],
    ...inferRiskControlFields("allow", level)
  };
}

/** F-1：在 ExecutionPlan 前插入人工确认步（不调模型） */
export function prependSafetyHumanConfirmExecutionPlan(
  plan: ExecutionPlan,
  safety: SafetyCheckResult
): ExecutionPlan {
  const message =
    safety.issues.map((i) => i.message).join("\n") || "请确认后继续执行该任务。";
  const humanStep: ExecutionPlanStep = {
    stepId: "human_confirm",
    type: "human_confirm",
    title: "高风险操作确认",
    description: message,
    status: "pending",
    input: {},
    output: null,
    humanMessage: message
  };
  const rest: ExecutionPlanStep[] = plan.steps.map((s) => ({ ...s, status: "pending" }));
  const merged = [humanStep, ...rest].map((s, i) => ({ ...s, stepId: `step_${i}` }));
  return { ...plan, steps: merged };
}

/** 在计划前插入与 D-5-7 兼容的 human 确认步 */
export function prependSafetyHumanConfirmStep(plan: TaskPlan, safety: SafetyCheckResult): TaskPlan {
  const message =
    safety.issues.map((i) => i.message).join("\n") || "请确认后继续执行该任务。";
  const human: TaskStep = {
    id: "tmp",
    type: "human",
    humanAction: "confirm",
    title: "高风险操作确认",
    message,
    status: "pending",
    producesResult: false
  };

  const rest = plan.steps.map(
    (s): TaskStep => ({
      ...s,
      id: "tmp",
      status: "pending"
    })
  );

  return {
    ...plan,
    steps: finalizeLinearPlanSteps([human, ...rest])
  };
}

export function safetyBlockUserFacingMessage(result: SafetyCheckResult): string {
  if (!result.issues.length) return "任务未通过安全校验，执行已阻止。";
  return result.issues.map((i) => i.message).join(" ");
}
