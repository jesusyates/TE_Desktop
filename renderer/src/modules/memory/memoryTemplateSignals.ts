/**
 * D-7-4M：模板 → 本地 memory 轻量信号（行为日志一行），无网络、无 await。
 */

import type { ResolvedTaskMode } from "../../types/taskMode";
import type { Template } from "../templates/types/template";
import type { UserBehaviorMemory } from "./memoryTypes";
import { loadMemorySnapshot, saveMemorySnapshot } from "./memoryStore";

function newBehaviorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function mapWorkflowTypeToResolvedMode(w?: string | null): ResolvedTaskMode {
  const wk = (w ?? "").toLowerCase().trim();
  if (wk === "computer" || wk === "automation") return "computer";
  return "content";
}

/** 从模板步骤快照中浅层收集 capabilityId（不解析后端专有结构） */
export function extractCapabilityIdsFromStepsSnapshot(steps: unknown): string[] {
  if (!Array.isArray(steps)) return [];
  const out: string[] = [];
  for (const step of steps) {
    if (step && typeof step === "object") {
      const cap = (step as Record<string, unknown>).capabilityId;
      if (typeof cap === "string" && cap.trim()) out.push(cap.trim());
    }
  }
  return [...new Set(out)];
}

/**
 * 用户「保存为模板」成功后追加一条行为记录（含 templateSignal），不影响模板库本身。
 */
export function recordTemplateSavedMemorySignal(template: Template): void {
  const snap = loadMemorySnapshot();
  const ts = template.createdAt.trim() || new Date().toISOString();
  const platform = template.platform?.trim() ?? "";
  const workflowType = template.workflowType?.trim() ?? "";
  const capIds = extractCapabilityIdsFromStepsSnapshot(template.stepsSnapshot);

  const behavior: UserBehaviorMemory = {
    id: newBehaviorId(),
    timestamp: ts,
    prompt: `[template_saved:${template.id}]`,
    requestedMode: "auto",
    resolvedMode: mapWorkflowTypeToResolvedMode(workflowType),
    intent: "unknown",
    planId: null,
    stepIds: [],
    capabilityIds: capIds,
    resultKind: "none",
    success: true,
    templateSignal: {
      source: "template_saved",
      templateId: template.id,
      workflowType,
      platform,
      createdAt: ts,
      sourceTaskId: template.sourceTaskId.trim() || undefined,
      sourceRunId: template.sourceRunId?.trim() || undefined,
      sourceResultKind: template.sourceResultKind
    }
  };

  snap.behaviorLog.push(behavior);
  saveMemorySnapshot(snap);
}
