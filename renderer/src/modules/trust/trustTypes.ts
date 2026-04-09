export type FlowType = "local" | "cloud" | "mixed";

export type RiskLevel = "L0" | "L1" | "L2" | "L3";

export type ExecutionTrustAssessment = {
  flowType: FlowType;
  riskLevel: RiskLevel;
  riskReasons: string[];
};

const FLOW: FlowType[] = ["local", "cloud", "mixed"];
const LEVEL: RiskLevel[] = ["L0", "L1", "L2", "L3"];

export function normalizeExecutionTrust(raw: unknown): ExecutionTrustAssessment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const flowType = o.flowType;
  const riskLevel = o.riskLevel;
  const riskReasons = o.riskReasons;
  if (!FLOW.includes(flowType as FlowType)) return null;
  if (!LEVEL.includes(riskLevel as RiskLevel)) return null;
  if (!Array.isArray(riskReasons) || !riskReasons.every((x) => typeof x === "string")) return null;
  return {
    flowType: flowType as FlowType,
    riskLevel: riskLevel as RiskLevel,
    riskReasons
  };
}
