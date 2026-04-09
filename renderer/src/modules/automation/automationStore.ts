/**
 * Automation Console v1：本地编排资产（与 Saved Results / History 分 key 存储）。
 */
import { decodeLocalStorageDocument, encodeLocalStorageDocument } from "../../services/localDataSafety";
import type {
  AutomationRecord,
  AutomationSourceType,
  AutomationStatus,
  AutomationStepKind,
  AutomationStepRecord,
  AutomationTriggerType,
  CreateAutomationRecordInput
} from "./automationTypes";

const STORAGE_KEY = "aics.automationConsole.v1";
const MAX_ITEMS = 400;

type AutomationDocV1 = { v: 1; items: AutomationRecord[] };

function defaultDoc(): AutomationDocV1 {
  return { v: 1, items: [] };
}

const ALLOWED_STATUS: AutomationStatus[] = ["draft", "ready", "paused"];
const ALLOWED_TRIGGER: AutomationTriggerType[] = ["manual", "schedule_reserved", "event_reserved"];
const ALLOWED_SOURCE: AutomationSourceType[] = ["template", "saved_result", "workbench_result", "manual"];
const ALLOWED_KIND: AutomationStepKind[] = [
  "content_generate",
  "content_summarize",
  "local_scan",
  "local_read",
  "local_text_transform",
  "human_confirm",
  "unknown"
];

function normalizeStatus(x: unknown): AutomationStatus {
  return x === "ready" || x === "paused" || x === "draft" ? x : "draft";
}

function normalizeTrigger(x: unknown): AutomationTriggerType {
  return x === "schedule_reserved" || x === "event_reserved" || x === "manual" ? x : "manual";
}

function normalizeSource(x: unknown): AutomationSourceType {
  return x === "template" ||
    x === "saved_result" ||
    x === "workbench_result" ||
    x === "manual"
    ? x
    : "manual";
}

function normalizeKind(x: unknown): AutomationStepKind {
  return typeof x === "string" && (ALLOWED_KIND as string[]).includes(x) ? (x as AutomationStepKind) : "unknown";
}

function normalizeSteps(raw: unknown): AutomationStepRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: AutomationStepRecord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `stp-${i}-${Date.now()}`;
    const title = typeof o.title === "string" ? o.title.slice(0, 500) : `Step ${i + 1}`;
    out.push({
      id,
      kind: normalizeKind(o.kind),
      title: title || `Step ${i + 1}`,
      enabled: o.enabled !== false
    });
  }
  return out;
}

function normalizeRecord(row: unknown): AutomationRecord | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const title = typeof o.title === "string" ? o.title : "";
  const now = new Date().toISOString();
  const createdAt = typeof o.createdAt === "string" ? o.createdAt : now;
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : createdAt;
  return {
    id,
    title,
    description: typeof o.description === "string" ? o.description : undefined,
    status: normalizeStatus(o.status),
    triggerType: normalizeTrigger(o.triggerType),
    sourceType: normalizeSource(o.sourceType),
    sourceRefId: typeof o.sourceRefId === "string" && o.sourceRefId.trim() ? o.sourceRefId.trim() : undefined,
    prompt: typeof o.prompt === "string" ? o.prompt : undefined,
    steps: normalizeSteps(o.steps),
    createdAt,
    updatedAt
  };
}

function normalizeItems(raw: unknown[]): AutomationRecord[] {
  const out: AutomationRecord[] = [];
  for (const row of raw) {
    const r = normalizeRecord(row);
    if (r) out.push(r);
  }
  return out;
}

function loadDoc(): AutomationDocV1 {
  if (typeof window === "undefined") return defaultDoc();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDoc();
    const decoded = decodeLocalStorageDocument<AutomationDocV1>(raw, "automationConsole");
    if (decoded && typeof decoded === "object" && decoded.v === 1 && Array.isArray(decoded.items)) {
      return { v: 1, items: normalizeItems(decoded.items) };
    }
  } catch {
    /* 降级空态 */
  }
  return defaultDoc();
}

function persistDoc(doc: AutomationDocV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, encodeLocalStorageDocument(doc));
  } catch {
    /* quota */
  }
}

/** 按 updatedAt 降序 */
export function listAutomationRecords(): AutomationRecord[] {
  const { items } = loadDoc();
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getAutomationRecord(id: string): AutomationRecord | null {
  const tid = id.trim();
  if (!tid) return null;
  return loadDoc().items.find((x) => x.id === tid) ?? null;
}

function newId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `auto-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createAutomationRecord(input: CreateAutomationRecordInput): AutomationRecord {
  const now = new Date().toISOString();
  const id = newId();
  const row: AutomationRecord = {
    id,
    title: input.title.trim() || "—",
    description: input.description?.trim() || undefined,
    status: ALLOWED_STATUS.includes(input.status) ? input.status : "draft",
    triggerType: ALLOWED_TRIGGER.includes(input.triggerType) ? input.triggerType : "manual",
    sourceType: ALLOWED_SOURCE.includes(input.sourceType) ? input.sourceType : "manual",
    sourceRefId: input.sourceRefId?.trim() || undefined,
    prompt: input.prompt?.trim() || undefined,
    steps: normalizeSteps(input.steps),
    createdAt: now,
    updatedAt: now
  };
  const doc = loadDoc();
  doc.items = [row, ...doc.items.filter((x) => x.id !== id)].slice(0, MAX_ITEMS);
  persistDoc(doc);
  return row;
}

export function updateAutomationRecord(
  id: string,
  patch: Partial<
    Pick<
      AutomationRecord,
      "title" | "description" | "status" | "triggerType" | "sourceType" | "sourceRefId" | "prompt" | "steps"
    >
  >
): AutomationRecord | null {
  const tid = id.trim();
  if (!tid) return null;
  const doc = loadDoc();
  const idx = doc.items.findIndex((x) => x.id === tid);
  if (idx < 0) return null;
  const cur = doc.items[idx];
  const now = new Date().toISOString();
  const next: AutomationRecord = {
    ...cur,
    title: patch.title !== undefined ? patch.title.trim() || cur.title : cur.title,
    description: patch.description !== undefined ? patch.description?.trim() || undefined : cur.description,
    status: patch.status !== undefined && ALLOWED_STATUS.includes(patch.status) ? patch.status : cur.status,
    triggerType:
      patch.triggerType !== undefined && ALLOWED_TRIGGER.includes(patch.triggerType)
        ? patch.triggerType
        : cur.triggerType,
    sourceType:
      patch.sourceType !== undefined && ALLOWED_SOURCE.includes(patch.sourceType)
        ? patch.sourceType
        : cur.sourceType,
    sourceRefId: patch.sourceRefId !== undefined ? patch.sourceRefId?.trim() || undefined : cur.sourceRefId,
    prompt: patch.prompt !== undefined ? patch.prompt?.trim() || undefined : cur.prompt,
    steps: patch.steps !== undefined ? normalizeSteps(patch.steps) : cur.steps,
    updatedAt: now
  };
  doc.items[idx] = next;
  persistDoc(doc);
  return next;
}

export function deleteAutomationRecord(id: string): void {
  const tid = id.trim();
  if (!tid) return;
  const doc = loadDoc();
  doc.items = doc.items.filter((x) => x.id !== tid);
  persistDoc(doc);
}

/** draft → ready → paused → ready（仅 UI 资产态，非运行时） */
export function toggleAutomationStatus(id: string): AutomationRecord | null {
  const r = getAutomationRecord(id);
  if (!r) return null;
  const next: AutomationStatus =
    r.status === "draft" ? "ready" : r.status === "ready" ? "paused" : "ready";
  return updateAutomationRecord(id, { status: next });
}
