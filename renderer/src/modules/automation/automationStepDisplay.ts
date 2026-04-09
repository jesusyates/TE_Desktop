/**
 * 步骤在用户界面上的展示文案（不发大迁移；旧英文 title 在此兜底）。
 */
import type { UiCatalog } from "../../i18n/uiCatalog";
import type { AutomationStepKind, AutomationStepRecord } from "./automationTypes";

/** 与 createAutomationFromSource 对齐的占位 title（零宽字符包裹避免与用户输入冲突） */
export const STEP_TITLE_PLACEHOLDER_SAVED = "\u200bAICS_PH_SAVED\u200b";
export const STEP_TITLE_PLACEHOLDER_TEMPLATE = "\u200bAICS_PH_TEMPLATE\u200b";

const LEGACY_SAVED = /^draft from saved result/i;
const LEGACY_TEMPLATE = /^placeholder step from template/i;

export function stepKindLabel(u: UiCatalog, kind: AutomationStepKind): string {
  const a = u.automation;
  switch (kind) {
    case "content_generate":
      return a.stepKindContentGenerate;
    case "content_summarize":
      return a.stepKindContentSummarize;
    case "local_scan":
      return a.stepKindLocalScan;
    case "local_read":
      return a.stepKindLocalRead;
    case "local_text_transform":
      return a.stepKindLocalTextTransform;
    case "human_confirm":
      return a.stepKindHumanConfirm;
    default:
      return a.stepKindUnknown;
  }
}

export function displayStepTitle(u: UiCatalog, step: AutomationStepRecord): string {
  const raw = step.title.trim();
  if (raw === STEP_TITLE_PLACEHOLDER_SAVED || LEGACY_SAVED.test(raw)) {
    return u.automation.stepTitlePlaceholderFromSaved;
  }
  if (raw === STEP_TITLE_PLACEHOLDER_TEMPLATE || LEGACY_TEMPLATE.test(raw)) {
    return u.automation.stepTitlePlaceholderFromTemplate;
  }
  if (!raw) {
    return step.kind === "unknown" ? u.automation.stepTitleToFill : stepKindLabel(u, step.kind);
  }
  if (/^step\s*\d+$/i.test(raw) && step.kind === "unknown") {
    return u.automation.stepTitleToFill;
  }
  return raw;
}

export function countEnabledSteps(steps: AutomationStepRecord[]): number {
  return steps.reduce((n, s) => n + (s.enabled ? 1 : 0), 0);
}
