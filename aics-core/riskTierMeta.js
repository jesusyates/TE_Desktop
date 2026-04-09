/**
 * D-7-3W：风险等级 → 控制要求骨架（authRequirement / interruptible / auditRequired）。
 * 仅协议字段，不做实名或账户逻辑。
 */

/**
 * @param {"allow"|"warn"|"confirm"|"block"} decision
 * @param {"low"|"medium"|"high"|"critical"} level
 */
function enrichRiskControl(decision, level) {
  const L = level && ["low", "medium", "high", "critical"].includes(level) ? level : "low";

  let authRequirement = "none";

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

  const interruptible = decision === "confirm" || decision === "block";
  const auditRequired = decision === "block";

  return { authRequirement, interruptible, auditRequired };
}

module.exports = { enrichRiskControl };
