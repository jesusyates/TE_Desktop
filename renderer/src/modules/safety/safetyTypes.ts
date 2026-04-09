import type { TaskPlan } from "../workbench/planner/taskPlanTypes";

export type SafetyDecision = "allow" | "block" | "confirm" | "warn";

export type SafetyIssueLevel = "low" | "medium" | "high" | "critical";

/** D-7-3V：与 Core 分级对齐 */
export type TieredRiskLevel = "low" | "medium" | "high" | "critical";

export type SafetyIssue = {
  code: string;
  message: string;
  level: SafetyIssueLevel;
};

export type SafetyCheckInput = {
  prompt: string;
  plan: TaskPlan;
  context?: { userId?: string; environment?: string };
};

import type { AuthRequirementLevel } from "../../services/riskTierPolicy";

export type { AuthRequirementLevel };

export type SafetyCheckResult = {
  decision: SafetyDecision;
  issues: SafetyIssue[];
  level?: TieredRiskLevel;
  reason?: string;
  codes?: string[];
  authRequirement?: AuthRequirementLevel;
  interruptible?: boolean;
  auditRequired?: boolean;
};
