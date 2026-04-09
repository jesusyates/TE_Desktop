import { finalizeLinearPlanSteps } from "../workbench/planner/taskPlanner";
import type { TaskPlan, TaskStep } from "../workbench/planner/taskPlanTypes";
import { inferRiskControlFields } from "../../services/riskTierPolicy";
import type {
  PermissionCheckInput,
  PermissionCheckResult,
  PermissionKey
} from "./permissionTypes";

const META_PERMISSION_KEYS = "permissionGrantKeys";

export { META_PERMISSION_KEYS };

/**
 * 平台禁用 > 用户未授权（confirm）> allow
 */
export function checkPermissions(input: PermissionCheckInput): PermissionCheckResult {
  const { capabilityRequiredPermissions, platformEnabledPermissions, userGrantedPermissions } = input;

  const blockedByPlatform = capabilityRequiredPermissions.filter(
    (p) => !platformEnabledPermissions.includes(p)
  );

  if (blockedByPlatform.length) {
    const message = `该操作已被平台禁用，缺少：${blockedByPlatform.join("、")}。`;
    const level = "high" as const;
    return {
      decision: "block",
      missingUserPermissions: [],
      blockedByPlatform,
      message,
      level,
      reason: message,
      codes: ["platform_blocked"],
      ...inferRiskControlFields("block", level)
    };
  }

  const missingUserPermissions = capabilityRequiredPermissions.filter(
    (p) => !userGrantedPermissions.includes(p)
  );

  if (missingUserPermissions.length) {
    const message = `本次任务需要以下权限：${missingUserPermissions.join("、")}。`;
    const level = "medium" as const;
    return {
      decision: "confirm",
      missingUserPermissions,
      blockedByPlatform: [],
      message,
      level,
      reason: message,
      codes: ["permission_confirm"],
      ...inferRiskControlFields("confirm", level)
    };
  }

  const level = "low" as const;
  return {
    decision: "allow",
    missingUserPermissions: [],
    blockedByPlatform: [],
    level,
    reason: "",
    codes: [],
    ...inferRiskControlFields("allow", level)
  };
}

/** 在当前 capability 步骤前插入权限 human 步（与 D-5-7 兼容） */
export function insertPermissionConfirmStep(
  plan: TaskPlan,
  atIndex: number,
  perm: PermissionCheckResult
): TaskPlan {
  const missing = perm.missingUserPermissions;
  const msg =
    perm.message ||
    `本次任务需要以下权限：${missing.join("、")}。点击「确认并继续」视为本次任务同意授予。`;
  const human: TaskStep = {
    id: "tmp",
    type: "human",
    humanAction: "confirm",
    title: "权限确认",
    message: msg,
    status: "pending",
    producesResult: false,
    metadata: { [META_PERMISSION_KEYS]: missing }
  };
  const nextSteps = [...plan.steps.slice(0, atIndex), human, ...plan.steps.slice(atIndex)];
  return {
    ...plan,
    steps: finalizeLinearPlanSteps(nextSteps)
  };
}

export function isPermissionGrantStepMetadata(meta: Record<string, unknown> | undefined): boolean {
  const k = meta?.[META_PERMISSION_KEYS];
  return Array.isArray(k) && k.length > 0;
}

export function readPermissionGrantKeysFromStep(meta: Record<string, unknown> | undefined): PermissionKey[] {
  const k = meta?.[META_PERMISSION_KEYS];
  if (!Array.isArray(k)) return [];
  return k.filter((x): x is PermissionKey =>
    x === "fs.read" || x === "fs.write" || x === "app.control" || x === "network.access"
  );
}
