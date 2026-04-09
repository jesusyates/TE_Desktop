/**
 * D-4：Workbench 主链消费的 Core Memory 轻量 hints（仅 GET /memory/list + 按需 GET /memory/:id）。
 * 不得使用 /memory-records 或 snapshot items 作为主消费源。
 */
import { fetchMemoryById, fetchMemoryList, type MemoryListItemVm } from "../../services/coreMemoryService";
import type { StyleOutputLength, StylePreferencesSnapshot } from "../../types/stylePreferences";
import type { TaskMode } from "../../types/taskMode";
import { loadAppPreferences } from "../preferences/appPreferences";

const ALLOWED_TYPES = new Set([
  "style_preference",
  "platform_preference",
  "mode_preference",
  "template_preference",
  "successful_task_hint"
]);

const MAX_LINE = 100;
const MAX_HINT_LINES = 3;
const STYLE_SUMMARY_MAX = 80;

/** 发往 Core /analyze、/plan 的轻量契约（与 aics-core sanitize 对齐） */
export type CoreMemoryHintsWire = {
  preferredMode?: "content" | "computer";
  hintLines?: string[];
  styleSummary?: Record<string, string>;
  platformHint?: string;
  templatePreference?: {
    templateId?: string;
    workflowType?: string;
    platform?: string;
  };
};

export type WorkbenchMemoryHintsBundle = {
  wire: CoreMemoryHintsWire;
  styleOverlay: StylePreferencesSnapshot;
  preferredModeFromMemory: "content" | "computer" | null;
  uiLabels: string[];
  /** H-2：本轮参与组装的 Core Memory 条目 id，供跳转记忆页 */
  contributingMemoryIds: string[];
};

function clip(s: string, n: number): string {
  const t = s.trim();
  if (!t) return "";
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 1))}…`;
}

function parseJsonObject(s: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(s) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function strVal(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickNewestPerType(list: MemoryListItemVm[]): Map<string, MemoryListItemVm> {
  const allowed = list.filter((it) => it.memoryType && ALLOWED_TYPES.has(it.memoryType));
  allowed.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const m = new Map<string, MemoryListItemVm>();
  for (const it of allowed) {
    if (!m.has(it.memoryType)) m.set(it.memoryType, it);
  }
  return m;
}

function asOutputLength(v: unknown): StyleOutputLength | undefined {
  return v === "short" || v === "medium" || v === "long" ? v : undefined;
}

/** Memory 查询失败返回 null，不抛错（主链降级）。 */
export async function loadWorkbenchCoreMemoryHintsBestEffort(): Promise<WorkbenchMemoryHintsBundle | null> {
  if (!loadAppPreferences().memoryTemplate.applyMemoryHintsInTasks) {
    return null;
  }

  let list: MemoryListItemVm[];
  try {
    const res = await fetchMemoryList({ page: 1, pageSize: 100, isActive: "true" });
    list = res.list;
  } catch (e) {
    console.warn("[D-4] fetchMemoryList failed (workbench hints degraded)", e);
    return null;
  }

  const byType = pickNewestPerType(list);
  const wire: CoreMemoryHintsWire = {};
  const styleOverlay: StylePreferencesSnapshot = {};
  const uiLabels: string[] = [];
  const contributingMemoryIds: string[] = [];
  const pushContributingId = (id: string | undefined) => {
    const t = id?.trim();
    if (t) contributingMemoryIds.push(t);
  };
  let preferredModeFromMemory: "content" | "computer" | null = null;

  const detailIds = new Set<string>();
  for (const t of ["style_preference", "mode_preference", "template_preference"] as const) {
    const it = byType.get(t);
    if (it?.memoryId) detailIds.add(it.memoryId);
  }

  const detailMap = new Map<string, Awaited<ReturnType<typeof fetchMemoryById>>>();
  await Promise.all(
    [...detailIds].map(async (id) => {
      try {
        const d = await fetchMemoryById(id);
        detailMap.set(id, d);
      } catch (e) {
        console.warn("[D-4] fetchMemoryById failed", id, e);
      }
    })
  );

  const styleItem = byType.get("style_preference");
  if (styleItem) {
    const full = styleItem.memoryId ? detailMap.get(styleItem.memoryId) : undefined;
    const raw = (full?.value ?? styleItem.valuePreview ?? "").trim();
    const jo = parseJsonObject(raw) || {};
    const tone = strVal(jo, "tone");
    const audience = strVal(jo, "audience");
    const languagePreference = strVal(jo, "languagePreference");
    const notes = strVal(jo, "notes");
    const outputLength = asOutputLength(jo.outputLength);
    if (tone) styleOverlay.tone = tone;
    if (audience) styleOverlay.audience = audience;
    if (languagePreference) styleOverlay.languagePreference = languagePreference;
    if (notes) styleOverlay.notes = notes;
    if (outputLength) styleOverlay.outputLength = outputLength;
    if (Object.keys(styleOverlay).length) {
      uiLabels.push("已识别历史风格 / 风格偏好");
      pushContributingId(styleItem.memoryId);
    }
  }

  const modeItem = byType.get("mode_preference");
  if (modeItem) {
    const full = modeItem.memoryId ? detailMap.get(modeItem.memoryId) : undefined;
    const raw = (full?.value ?? modeItem.valuePreview ?? "").trim();
    const jo = parseJsonObject(raw) || {};
    const mode =
      strVal(jo, "mode") || strVal(jo, "preferredMode") || strVal(jo, "resolvedMode") || raw;
    if (mode === "content" || mode === "computer") {
      preferredModeFromMemory = mode;
      wire.preferredMode = mode;
      uiLabels.push(`已应用偏好：默认模式（${mode}）`);
      pushContributingId(modeItem.memoryId);
    }
  }

  const templateItem = byType.get("template_preference");
  if (templateItem) {
    const full = templateItem.memoryId ? detailMap.get(templateItem.memoryId) : undefined;
    const raw = (full?.value ?? templateItem.valuePreview ?? "").trim();
    const jo = parseJsonObject(raw) || {};
    const templateId = strVal(jo, "templateId");
    const workflowType = strVal(jo, "workflowType");
    const platform = strVal(jo, "platform");
    if (templateId || workflowType || platform) {
      wire.templatePreference = {
        ...(templateId ? { templateId } : {}),
        ...(workflowType ? { workflowType } : {}),
        ...(platform ? { platform } : {})
      };
      uiLabels.push("已应用模板偏好");
      pushContributingId(templateItem.memoryId);
    }
  }

  const platItem = byType.get("platform_preference");
  if (platItem) {
    const text = clip(platItem.valuePreview || platItem.key, MAX_LINE);
    if (text) {
      wire.platformHint = text;
      uiLabels.push("已应用平台偏好");
      pushContributingId(platItem.memoryId);
    }
  }

  const hintItems = list
    .filter((it) => it.memoryType === "successful_task_hint")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const hintLines: string[] = [];
  for (const it of hintItems) {
    if (hintLines.length >= MAX_HINT_LINES) break;
    const line = clip(it.valuePreview || it.key, MAX_LINE);
    if (line && !hintLines.includes(line)) {
      hintLines.push(line);
      pushContributingId(it.memoryId);
    }
  }
  if (hintLines.length) {
    wire.hintLines = hintLines;
    uiLabels.push("已参考历史成功提示");
  }

  const styleSummary: Record<string, string> = {};
  if (styleOverlay.tone) styleSummary.tone = clip(styleOverlay.tone, STYLE_SUMMARY_MAX);
  if (styleOverlay.audience) styleSummary.audience = clip(styleOverlay.audience, STYLE_SUMMARY_MAX);
  if (styleOverlay.languagePreference)
    styleSummary.languagePreference = clip(styleOverlay.languagePreference, STYLE_SUMMARY_MAX);
  if (styleOverlay.notes) styleSummary.notes = clip(styleOverlay.notes, STYLE_SUMMARY_MAX);
  if (styleOverlay.outputLength) styleSummary.outputLength = styleOverlay.outputLength;
  if (Object.keys(styleSummary).length) wire.styleSummary = styleSummary;

  const hasWire =
    wire.preferredMode != null ||
    (wire.hintLines != null && wire.hintLines.length > 0) ||
    (wire.styleSummary != null && Object.keys(wire.styleSummary).length > 0) ||
    wire.platformHint != null ||
    wire.templatePreference != null;

  if (!hasWire && uiLabels.length === 0) return null;

  const uniqueIds = [...new Set(contributingMemoryIds)];
  return { wire, styleOverlay, preferredModeFromMemory, uiLabels, contributingMemoryIds: uniqueIds };
}

export function mergeStylePreferencesWithMemoryOverlay(
  base: StylePreferencesSnapshot,
  overlay: StylePreferencesSnapshot
): StylePreferencesSnapshot {
  if (!overlay || !Object.keys(overlay).length) return { ...base };
  return { ...base, ...overlay };
}

/** 仅在用户为 auto 时采用 Memory 中的模式偏好 */
export function effectiveWorkbenchRequestedMode(
  userMode: TaskMode | undefined,
  preferredFromMemory: "content" | "computer" | null
): TaskMode {
  const u = userMode ?? "auto";
  if (u !== "auto") return u;
  if (preferredFromMemory === "content" || preferredFromMemory === "computer") return preferredFromMemory;
  return "auto";
}
