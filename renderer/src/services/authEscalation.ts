/**
 * D-7-3W：根据 authRequirement 与当前会话决定是否阻断执行（占位，不接实名）。
 */

import type { AuthRequirementLevel } from "./riskTierPolicy";

export type AuthEscalationKind = "login" | "verified";

/** `hasAccessToken === false` 视为 guest（无有效登录票据） */
export function evaluateAuthEscalation(
  authRequirement: AuthRequirementLevel | undefined,
  hasAccessToken: boolean
): { shouldAbort: boolean; userMessage?: string; escalation?: AuthEscalationKind } {
  const req = authRequirement ?? "none";
  if (req === "none") return { shouldAbort: false };

  if (req === "login") {
    if (!hasAccessToken) {
      return {
        shouldAbort: true,
        userMessage: "需要登录后继续当前操作。",
        escalation: "login"
      };
    }
    return { shouldAbort: false };
  }

  if (req === "verified") {
    return {
      shouldAbort: true,
      userMessage: "需要更高等级认证后方可继续（实名/强化验证能力预留）。",
      escalation: "verified"
    };
  }

  return { shouldAbort: false };
}
