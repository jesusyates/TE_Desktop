/**
 * 将模板快照 / 执行计划等映射为 Automation 步骤结构（轻量、无损降级）。
 */
import type { ExecutionPlanStep, ExecutionPlanStepType } from "../workbench/execution/executionPlanTypes";
import type { AutomationStepKind, AutomationStepRecord } from "./automationTypes";

export function mapExecutionPlanStepTypeToKind(t: ExecutionPlanStepType): AutomationStepKind {
  switch (t) {
    case "generate":
      return "content_generate";
    case "summarize":
      return "content_summarize";
    case "local_scan":
      return "local_scan";
    case "local_read":
      return "local_read";
    case "local_text_transform":
      return "local_text_transform";
    case "human_confirm":
      return "human_confirm";
    default:
      return "unknown";
  }
}

export function mapExecutionStepsToAutomationSteps(steps: ExecutionPlanStep[]): AutomationStepRecord[] {
  return steps.map((s, i) => ({
    id: s.stepId?.trim() || `exec-step-${i}-${Date.now()}`,
    kind: mapExecutionPlanStepTypeToKind(s.type),
    title: (s.title?.trim() || `Step ${i + 1}`).slice(0, 200),
    enabled: true
  }));
}

/** 将模板 / 计划中的 type 字符串映射为 AutomationStepKind */
export function mapLooseTypeStringToKind(t: string): AutomationStepKind {
  const n = t.trim().toLowerCase();
  if (n === "generate" || n === "content_generate") return "content_generate";
  if (n === "summarize" || n === "content_summarize") return "content_summarize";
  if (n === "local_scan") return "local_scan";
  if (n === "local_read" || n === "local_file_operation") return "local_read";
  if (n === "local_text_transform") return "local_text_transform";
  if (n === "human_confirm") return "human_confirm";
  return "unknown";
}

/** 从 Core stepsSnapshot unknown[] 推导步骤；无法解析时返回空数组（由调用方补 unknown 步） */
export function mapTemplateStepsSnapshotToAutomationSteps(snapshot: unknown[]): AutomationStepRecord[] {
  const out: AutomationStepRecord[] = [];
  let i = 0;
  for (const raw of snapshot) {
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const typeStr =
        typeof o.type === "string"
          ? o.type
          : typeof o.stepType === "string"
            ? o.stepType
            : typeof o.kind === "string"
              ? o.kind
              : "";
      const title =
        typeof o.title === "string"
          ? o.title
          : typeof o.name === "string"
            ? o.name
            : typeof o.label === "string"
              ? o.label
              : `Step ${i + 1}`;
      const id =
        typeof o.stepId === "string"
          ? o.stepId
          : typeof o.id === "string"
            ? o.id
            : typeof o.key === "string"
              ? o.key
              : `tpl-step-${i}-${Date.now()}`;
      out.push({
        id: id.trim() || `tpl-step-${i}`,
        kind: typeStr ? mapLooseTypeStringToKind(typeStr) : "unknown",
        title: title.trim().slice(0, 200) || `Step ${i + 1}`,
        enabled: true
      });
    } else {
      out.push({
        id: `tpl-step-${i}-${Date.now()}`,
        kind: "unknown",
        title: `Step ${i + 1}`,
        enabled: true
      });
    }
    i++;
  }
  return out;
}
