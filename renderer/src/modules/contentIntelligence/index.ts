/**
 * Content Intelligence 公共出口（Phase 1）。
 */

export type {
  AgentRoleId,
  ContentActionKind,
  DuplicateRiskLevel,
  IntelOrchestrationTrace,
  SimilarHistoryHit,
  StructuredAgentOutput
} from "./types";
export { duplicateRiskFromScore, jaccardSimilarity, normalizeForSim } from "./textSimilarity";
export { runIntelPostCritic, runIntelPreFlight } from "./phase1/runIntelPreFlight";
