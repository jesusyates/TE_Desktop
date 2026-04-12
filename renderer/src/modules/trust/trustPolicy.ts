import type { TaskPlan } from "../workbench/planner/taskPlanTypes";
import type { ExecutionPlan } from "../workbench/execution/executionPlanTypes";
import type { CoreMemoryHintsWire } from "../memory/workbenchCoreMemoryHints";
import type { ExecutionTrustAssessment, FlowType } from "./trustTypes";

function isExecutionPlanShape(p: TaskPlan | ExecutionPlan | null | undefined): p is ExecutionPlan {
  return Boolean(p && typeof p === "object" && "planId" in p);
}

function taskPlanUsesCloudAi(plan: TaskPlan | null | undefined): boolean {
  const steps = plan?.steps ?? [];
  return steps.some(
    (s) =>
      s.type === "content" &&
      (s.contentAction === "generate" || s.contentAction === "summarize_result")
  );
}

function taskPlanHasCapabilitySteps(plan: TaskPlan | null | undefined): boolean {
  return (plan?.steps ?? []).some((s) => s.type === "capability");
}

function executionPlanUsesCloudAi(plan: ExecutionPlan | null | undefined): boolean {
  const steps = plan?.steps ?? [];
  return steps.some((s) => s.type === "generate" || s.type === "summarize");
}

function executionPlanHasCapabilitySteps(plan: ExecutionPlan | null | undefined): boolean {
  return (plan?.steps ?? []).some((s) => s.type === "capability");
}

function unifiedUsesCloudAi(plan: TaskPlan | ExecutionPlan | null | undefined): boolean {
  if (!plan) return false;
  return isExecutionPlanShape(plan) ? executionPlanUsesCloudAi(plan) : taskPlanUsesCloudAi(plan);
}

function unifiedHasCapability(plan: TaskPlan | ExecutionPlan | null | undefined): boolean {
  if (!plan) return false;
  return isExecutionPlanShape(plan) ? executionPlanHasCapabilitySteps(plan) : taskPlanHasCapabilitySteps(plan);
}

function computeFlowType(plan: TaskPlan | ExecutionPlan | null | undefined): FlowType {
  const cloud = unifiedUsesCloudAi(plan);
  const cap = unifiedHasCapability(plan);
  if (cloud && cap) return "mixed";
  if (cloud) return "cloud";
  if (cap) return "local";
  return "local";
}

function memoryHintNonEmpty(w: CoreMemoryHintsWire | undefined): boolean {
  return Boolean(w && typeof w === "object" && Object.keys(w).length > 0);
}

/** 与 aics-core `executionTrust.js` 对齐的客户端兜底（服务端未带 trust 字段时）。 */
export function computeClientTrustV1(
  plan: TaskPlan | ExecutionPlan | null | undefined,
  memoryHints: CoreMemoryHintsWire | undefined
): ExecutionTrustAssessment {
  const riskReasons: string[] = [];
  let riskLevel: ExecutionTrustAssessment["riskLevel"] = "L0";

  if (memoryHintNonEmpty(memoryHints)) {
    riskReasons.push("store_memory");
    riskLevel = "L1";
  }

  if (unifiedUsesCloudAi(plan)) {
    riskReasons.push("local_to_cloud");
    riskLevel = "L2";
  }

  return {
    flowType: computeFlowType(plan),
    riskLevel,
    riskReasons
  };
}

export type TrustGateStrings = {
  l2Message: string;
  l2Continue: string;
  l2Cancel: string;
  l1MemoryHint: string;
  l3BlockedToast: string;
};

function l1HintFor(reasons: string[], strings: TrustGateStrings): string | null {
  if (reasons.includes("store_memory")) return strings.l1MemoryHint;
  return null;
}

/**
 * 执行前门控：L0 无感；L1 仅提示；L2 视「允许自动云端」决定是否弹确认；L3 阻断。
 */
export async function runWithTrustGate(
  assessment: ExecutionTrustAssessment,
  options: {
    allowAutoCloudAI: boolean;
    strings: TrustGateStrings;
    onL1Hint: (message: string) => void;
    confirmL2: () => Promise<boolean>;
    onL3Blocked?: (message: string) => void;
  }
): Promise<boolean> {
  const { riskLevel, riskReasons } = assessment;
  if (riskLevel === "L3") {
    const msg = options.strings.l3BlockedToast;
    options.onL3Blocked?.(msg);
    return false;
  }
  if (riskLevel === "L2") {
    if (options.allowAutoCloudAI) return true;
    return options.confirmL2();
  }
  if (riskLevel === "L1") {
    const hint = l1HintFor(riskReasons, options.strings);
    if (hint) options.onL1Hint(hint);
    return true;
  }
  return true;
}
