/**
 * D-2：Memory 写入唯一出口 — 归一结构、受控 memoryType、须登录；禁止页面直拼 Core 载荷。
 */
import type { TaskAnalysisResult } from "../workbench/analyzer/taskAnalyzerTypes";
import type { ExecutionPlan } from "../workbench/execution/executionPlanTypes";
import type { TaskResult } from "../result/resultTypes";
import { isLocalRuntimeSummaryOnlyForPersistence } from "../result/taskResultLocalRetention";
import type { StylePreferencesSnapshot } from "../../types/stylePreferences";
import type { TaskMode } from "../../types/taskMode";
import { postMemoryRecordToCore } from "../../services/api";
import { getStylePreferencesSnapshot } from "../../services/stylePreferencesService";
import { listTemplateSummaries } from "../../services/templateService";
import { useAuthStore } from "../../store/authStore";

export const MEMORY_TYPE_VALUES = [
  "style_preference",
  "platform_preference",
  "successful_task_hint",
  "mode_preference",
  "template_preference"
] as const;

export type MemoryType = (typeof MEMORY_TYPE_VALUES)[number];

function loggedIn(): boolean {
  return Boolean(useAuthStore.getState().userId.trim());
}

function summarizeForHint(
  body: string | undefined,
  title: string | undefined,
  summary: string | undefined
): string {
  const t = (title ?? "").trim();
  const s = (summary ?? "").trim();
  const b = (body ?? "").trim();
  const primary = t || s || b;
  return primary.slice(0, 200);
}

/** 成功任务摘要 hint（不含全文结果）。 */
export async function writeSuccessfulTaskHintToCore(input: {
  prompt: string;
  requestedMode: string;
  resolvedMode: string;
  intent: string;
  planId?: string | null;
  stepIds?: string[];
  capabilityIds: string[];
  resultKind?: string;
  sourceId: string;
  resultTitle?: string;
  resultBody?: string;
  resultSummary?: string;
}): Promise<void> {
  if (!loggedIn()) return;
  const summaryLine = summarizeForHint(input.resultBody, input.resultTitle, input.resultSummary);
  const value = {
    intent: input.intent.slice(0, 256),
    resolvedMode: input.resolvedMode.slice(0, 64),
    requestedMode: input.requestedMode.slice(0, 64),
    resultKind: (input.resultKind ?? "").slice(0, 32),
    capabilityIds: input.capabilityIds.map((c) => c.slice(0, 128)).slice(0, 64),
    summaryLine
  };
  await postMemoryRecordToCore({
    prompt: input.prompt.trim(),
    memoryType: "successful_task_hint",
    key: `hint:${input.intent.slice(0, 120)}`,
    value,
    source: "task",
    sourceId: input.sourceId.slice(0, 256),
    requestedMode: input.requestedMode,
    resolvedMode: input.resolvedMode,
    intent: input.intent,
    planId: input.planId ?? undefined,
    stepIds: input.stepIds,
    capabilityIds: input.capabilityIds,
    resultKind: input.resultKind,
    success: true
  });
}

export async function writeStylePreferenceSnapshotToCore(
  snapshot: StylePreferencesSnapshot,
  sourceId: string
): Promise<void> {
  if (!loggedIn()) return;
  const value: Record<string, string> = {};
  if (snapshot.tone?.trim()) value.tone = snapshot.tone.trim().slice(0, 200);
  if (snapshot.audience?.trim()) value.audience = snapshot.audience.trim().slice(0, 200);
  if (snapshot.outputLength) value.outputLength = snapshot.outputLength;
  if (snapshot.languagePreference?.trim()) {
    value.languagePreference = snapshot.languagePreference.trim().slice(0, 64);
  }
  if (snapshot.notes?.trim()) value.notes = snapshot.notes.trim().slice(0, 500);
  if (Object.keys(value).length === 0) return;

  await postMemoryRecordToCore({
    prompt: "[memory:style_preference] workbench",
    memoryType: "style_preference",
    key: "style.snapshot",
    value,
    source: "preference",
    sourceId: sourceId.slice(0, 256),
    requestedMode: "",
    resolvedMode: "",
    intent: "",
    capabilityIds: [],
    success: true
  });
}

/** 用户显式切换任务模式（工作台输入栏）。 */
export async function writeModePreferenceToCore(mode: TaskMode): Promise<void> {
  if (!loggedIn()) return;
  const m = String(mode ?? "auto").trim().slice(0, 32);
  if (!m) return;
  await postMemoryRecordToCore({
    prompt: `[memory:mode_preference] ${m}`,
    memoryType: "mode_preference",
    key: "task_mode.selection",
    value: { mode: m },
    source: "preference",
    sourceId: `mode:${m}:${Date.now()}`,
    requestedMode: m === "auto" ? "auto" : m,
    resolvedMode: "",
    intent: "",
    capabilityIds: [],
    success: true
  });
}

/** 使用模板启动任务（templateId 来自 submit 载荷）。 */
export async function writeTemplatePreferenceToCore(
  templateId: string,
  sourceId: string
): Promise<void> {
  const tid = templateId.trim();
  if (!loggedIn() || !tid) return;
  const row = listTemplateSummaries().find((s) => s.id === tid);
  const workflowType = row?.workflowType?.trim() ?? "";
  await postMemoryRecordToCore({
    prompt: `[memory:template_preference] ${tid.slice(0, 120)}`,
    memoryType: "template_preference",
    key: `template:${tid.slice(0, 200)}`,
    value: { templateId: tid.slice(0, 256), workflowType: workflowType.slice(0, 64) },
    source: "template",
    sourceId: sourceId.slice(0, 256),
    requestedMode: "",
    resolvedMode: "",
    intent: "",
    capabilityIds: [],
    success: true
  });
}

export async function writePlatformPreferenceToCore(
  platform: string,
  sourceId: string
): Promise<void> {
  const p = platform.trim();
  if (!loggedIn() || !p) return;
  await postMemoryRecordToCore({
    prompt: `[memory:platform_preference] ${p.slice(0, 80)}`,
    memoryType: "platform_preference",
    key: "content.platform",
    value: { platform: p.slice(0, 128) },
    source: "template",
    sourceId: sourceId.slice(0, 256),
    requestedMode: "",
    resolvedMode: "",
    intent: "",
    capabilityIds: [],
    success: true
  });
}

/**
 * 任务成功后的最小正式写入集（hint + 风格快照 + 模板/平台偏好）。
 */
export async function flushCanonicalMemoryAfterTaskSuccess(input: {
  prompt: string;
  lastRequestedMode?: TaskMode;
  lastTaskAnalysis: TaskAnalysisResult;
  executionPlan: ExecutionPlan | null;
  currentResult: TaskResult | null;
  runSourceId: string;
  templateId?: string;
}): Promise<void> {
  if (!loggedIn()) return;
  const analysis = input.lastTaskAnalysis;
  const plan = input.executionPlan;
  const capabilityIds = (plan?.steps ?? [])
    .map((st) => st.input.deferredCapabilityId)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  const cr = input.currentResult;
  let resultTitle: string | undefined;
  let resultBody: string | undefined;
  let resultSummary: string | undefined;
  if (cr?.kind === "content") {
    resultTitle = cr.title;
    if (isLocalRuntimeSummaryOnlyForPersistence(cr)) {
      resultBody = undefined;
      resultSummary = (cr.summary || "").trim() || (cr.title || "").trim() || undefined;
    } else {
      resultBody = cr.body;
      resultSummary = cr.summary;
    }
  } else if (cr) {
    resultBody = cr.body;
    resultSummary = cr.summary;
  }

  await writeSuccessfulTaskHintToCore({
    prompt: input.prompt,
    requestedMode: input.lastRequestedMode ?? "auto",
    resolvedMode: analysis.resolvedMode,
    intent: analysis.intent,
    planId: plan?.planId,
    stepIds: plan?.steps.map((st) => st.stepId),
    capabilityIds,
    resultKind: cr?.kind,
    sourceId: input.runSourceId,
    resultTitle,
    resultBody,
    resultSummary
  });

  await writeStylePreferenceSnapshotToCore(getStylePreferencesSnapshot(), input.runSourceId);

  const tid = input.templateId?.trim();
  if (tid) {
    await writeTemplatePreferenceToCore(tid, input.runSourceId);
    const plat = listTemplateSummaries().find((s) => s.id === tid)?.platform?.trim();
    if (plat) await writePlatformPreferenceToCore(plat, input.runSourceId);
  }
}
