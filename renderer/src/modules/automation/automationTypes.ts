/**
 * Automation Console v1：编排资产层（本地草案），非运行时系统。
 */

export type AutomationStatus = "draft" | "ready" | "paused";

export type AutomationTriggerType = "manual" | "schedule_reserved" | "event_reserved";

export type AutomationSourceType = "template" | "saved_result" | "workbench_result" | "manual";

export type AutomationStepKind =
  | "content_generate"
  | "content_summarize"
  | "local_scan"
  | "local_read"
  | "local_text_transform"
  | "human_confirm"
  | "unknown";

export type AutomationStepRecord = {
  id: string;
  kind: AutomationStepKind;
  title: string;
  enabled: boolean;
};

export type AutomationRecord = {
  id: string;
  title: string;
  description?: string;
  status: AutomationStatus;
  triggerType: AutomationTriggerType;
  sourceType: AutomationSourceType;
  sourceRefId?: string;
  prompt?: string;
  steps: AutomationStepRecord[];
  createdAt: string;
  updatedAt: string;
};

export type CreateAutomationRecordInput = Omit<AutomationRecord, "id" | "createdAt" | "updatedAt">;
