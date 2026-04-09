/**
 * Workflow / Task Chain v1：连续执行策略（仅 content，禁止 local_safe）
 */

import type { TaskAnalysisResult } from "./analyzer/taskAnalyzerTypes";
import type { TaskResult } from "../result/resultTypes";
import type { ResolvedTaskMode } from "../../types/taskMode";

const LOCAL_SAFE_INTENTS = new Set([
  "local_safe_rename",
  "local_safe_classify"
]);

export function isWorkflowChainAllowed(
  analysis: TaskAnalysisResult | null,
  resolvedMode: ResolvedTaskMode,
  result: TaskResult | null
): boolean {
  if (resolvedMode !== "content") return false;
  if (!result || result.kind !== "content") return false;
  const intent = analysis?.intent;
  if (intent && LOCAL_SAFE_INTENTS.has(intent)) return false;
  return true;
}

export function pickFirstNextSuggestion(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as { nextSuggestions?: unknown }).nextSuggestions;
  if (!Array.isArray(raw)) return null;
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t.length > 0) return t;
  }
  return null;
}

export function completionFingerprint(taskId: string, runId: string | null | undefined): string {
  return `${(taskId || "").trim()}::${(runId || "").trim() || "norun"}`;
}

export const WORKFLOW_CHAIN_MAX_AUTO_STEPS_V1 = 3;
