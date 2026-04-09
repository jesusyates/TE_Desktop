/**
 * 从各来源创建 Automation 草案（写入本地 store）。
 */
import type { TemplateCoreDetailRow } from "../../services/coreTemplateService";
import { normalizeTemplateCoreContent } from "../../services/coreTemplateService";
import type { ExecutionPlanStep } from "../workbench/execution/executionPlanTypes";
import type { SavedResultRecordV1 } from "../savedResults/savedResultsTypes";
import { mapExecutionStepsToAutomationSteps, mapTemplateStepsSnapshotToAutomationSteps } from "./automationMapper";
import { STEP_TITLE_PLACEHOLDER_SAVED, STEP_TITLE_PLACEHOLDER_TEMPLATE } from "./automationStepDisplay";
import { createAutomationRecord } from "./automationStore";
import type { AutomationRecord } from "./automationTypes";

function deriveTitleFromPrompt(prompt: string): string {
  const t = prompt.trim();
  if (!t) return "—";
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}

function seedUnknownStep(title: string) {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `u-${Date.now()}`,
    kind: "unknown" as const,
    title,
    enabled: true
  };
}

export function createEmptyAutomation(titleForBlank: string): AutomationRecord {
  return createAutomationRecord({
    title: titleForBlank.trim() || "—",
    description: undefined,
    status: "draft",
    triggerType: "manual",
    sourceType: "manual",
    sourceRefId: undefined,
    prompt: undefined,
    steps: []
  });
}

export function createAutomationFromSavedResult(saved: SavedResultRecordV1): AutomationRecord {
  const steps = [seedUnknownStep(STEP_TITLE_PLACEHOLDER_SAVED)];
  return createAutomationRecord({
    title: saved.title.trim() || deriveTitleFromPrompt(saved.prompt),
    description: undefined,
    status: "draft",
    triggerType: "manual",
    sourceType: "saved_result",
    sourceRefId: saved.id,
    prompt: saved.prompt,
    steps
  });
}

export function createAutomationFromTemplateDetail(detail: TemplateCoreDetailRow): AutomationRecord {
  const normalized = normalizeTemplateCoreContent(
    detail.content,
    typeof detail.workflowType === "string" ? detail.workflowType : undefined
  );
  let steps = mapTemplateStepsSnapshotToAutomationSteps(normalized.stepsSnapshot);
  if (steps.length === 0) {
    steps = [seedUnknownStep(STEP_TITLE_PLACEHOLDER_TEMPLATE)];
  }
  return createAutomationRecord({
    title: detail.title.trim() || "—",
    description: typeof detail.description === "string" ? detail.description : undefined,
    status: "draft",
    triggerType: "manual",
    sourceType: "template",
    sourceRefId: detail.templateId,
    prompt: normalized.sourcePrompt,
    steps
  });
}

export function createAutomationFromWorkbenchResult(input: {
  prompt: string;
  runId?: string | null;
  executionSteps?: ExecutionPlanStep[] | null;
}): AutomationRecord {
  const prompt = input.prompt.trim();
  const steps =
    input.executionSteps && input.executionSteps.length > 0
      ? mapExecutionStepsToAutomationSteps(input.executionSteps)
      : [];
  return createAutomationRecord({
    title: deriveTitleFromPrompt(prompt),
    status: "draft",
    triggerType: "manual",
    sourceType: "workbench_result",
    sourceRefId: input.runId?.trim() || undefined,
    prompt: prompt || undefined,
    steps
  });
}

/** 与规格命名一致 */
export const createAutomationFromTemplate = createAutomationFromTemplateDetail;
