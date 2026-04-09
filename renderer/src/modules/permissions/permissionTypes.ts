import type { AuthRequirementLevel } from "../../services/riskTierPolicy";

export type PermissionKey = "fs.read" | "fs.write" | "app.control" | "network.access";

export type { AuthRequirementLevel };

/** D-7-3V：与 Core 决策统一；原 deny 已并入 block */
export type PermissionDecision = "allow" | "warn" | "confirm" | "block";

export type PermissionTieredLevel = "low" | "medium" | "high" | "critical";

export type CapabilityPermissionDeclaration = {
  capabilityId: string;
  requiredPermissions: PermissionKey[];
};

export type PermissionCheckInput = {
  capabilityId: string;
  userGrantedPermissions: PermissionKey[];
  platformEnabledPermissions: PermissionKey[];
  capabilityRequiredPermissions: PermissionKey[];
};

export type PermissionCheckResult = {
  decision: PermissionDecision;
  missingUserPermissions: PermissionKey[];
  blockedByPlatform: PermissionKey[];
  message?: string;
  level?: PermissionTieredLevel;
  reason?: string;
  codes?: string[];
  authRequirement?: AuthRequirementLevel;
  interruptible?: boolean;
  auditRequired?: boolean;
};
