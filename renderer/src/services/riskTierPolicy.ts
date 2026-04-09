/**
 * D-7-3W：风险等级 → 控制要求（与 Core riskTierMeta.js 对齐；缺省推断用）。
 */

export type AuthRequirementLevel = "none" | "login" | "verified";

export type RiskControlFields = {
  authRequirement: AuthRequirementLevel;
  interruptible: boolean;
  auditRequired: boolean;
};

export function inferRiskControlFields(
  decision: "allow" | "warn" | "confirm" | "block",
  level: "low" | "medium" | "high" | "critical" | undefined
): RiskControlFields {
  const L = level ?? "low";

  let authRequirement: AuthRequirementLevel = "none";

  if (L === "low" && (decision === "allow" || decision === "warn")) {
    authRequirement = "none";
  } else if (L === "medium" && (decision === "warn" || decision === "confirm")) {
    authRequirement = "none";
  } else if (L === "high" && decision === "confirm") {
    authRequirement = "login";
  } else if (L === "critical" && decision === "block") {
    authRequirement = "verified";
  } else if (decision === "block") {
    authRequirement = "login";
  }

  return {
    authRequirement,
    interruptible: decision === "confirm" || decision === "block",
    auditRequired: decision === "block"
  };
}
