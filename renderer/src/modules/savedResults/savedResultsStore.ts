/**
 * Saved Results v1：用户主动沉淀的资产（本地 localStorage，与账户 History 分离）。
 */
import { decodeLocalStorageDocument, encodeLocalStorageDocument } from "../../services/localDataSafety";
import type { OutputTrust, ResultSource } from "../result/resultTypes";
import { MAX_ITEMS, type SavedResultRecordV1 } from "./savedResultsTypes";

const STORAGE_KEY = "aics.savedResults.v1";

type SavedResultsDocV1 = {
  v: 1;
  items: SavedResultRecordV1[];
};

function defaultDoc(): SavedResultsDocV1 {
  return { v: 1, items: [] };
}

function loadDoc(): SavedResultsDocV1 {
  if (typeof window === "undefined") return defaultDoc();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDoc();
    const decoded = decodeLocalStorageDocument<SavedResultsDocV1>(raw, "savedResults");
    if (decoded && typeof decoded === "object" && decoded.v === 1 && Array.isArray(decoded.items)) {
      return { v: 1, items: normalizeItems(decoded.items) };
    }
  } catch {
    /* ignore */
  }
  return defaultDoc();
}

function normalizeItems(raw: unknown[]): SavedResultRecordV1[] {
  const out: SavedResultRecordV1[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id) continue;
    const title = typeof o.title === "string" ? o.title : "";
    const prompt = typeof o.prompt === "string" ? o.prompt : "";
    const body = typeof o.body === "string" ? o.body : "";
    const savedAt = typeof o.savedAt === "string" ? o.savedAt : new Date().toISOString();
    const rs = Array.isArray(o.resultSources) ? normalizeResultSources(o.resultSources) : [];
    const ot = normalizeOutputTrust(o.outputTrust);
    out.push({
      v: 1,
      id,
      title,
      prompt,
      body,
      summary: typeof o.summary === "string" && o.summary.trim() ? o.summary : undefined,
      savedAt,
      completedAt: typeof o.completedAt === "string" ? o.completedAt : undefined,
      resultSourceDisplay:
        typeof o.resultSourceDisplay === "string" ? o.resultSourceDisplay : rs.join(", "),
      outputTrustDisplay:
        typeof o.outputTrustDisplay === "string" ? o.outputTrustDisplay : ot,
      resultSources: rs.length ? rs : ["fallback"],
      outputTrust: ot,
      savedWithFullLocal: o.savedWithFullLocal === true
    });
  }
  return out;
}

function normalizeResultSources(raw: unknown[]): ResultSource[] {
  const allowed: ResultSource[] = [
    "ai_result",
    "capability_result",
    "local_runtime",
    "mock",
    "fallback",
    "error"
  ];
  const out: ResultSource[] = [];
  for (const x of raw) {
    if (typeof x === "string" && (allowed as string[]).includes(x)) {
      out.push(x as ResultSource);
    }
  }
  return out;
}

function normalizeOutputTrust(raw: unknown): OutputTrust {
  if (raw === "authentic" || raw === "non_authentic" || raw === "mixed" || raw === "error") {
    return raw;
  }
  return "non_authentic";
}

function persistDoc(doc: SavedResultsDocV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, encodeLocalStorageDocument(doc));
  } catch {
    /* quota */
  }
}

export function listSavedResultsSorted(): SavedResultRecordV1[] {
  const { items } = loadDoc();
  return [...items].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function getSavedResult(id: string): SavedResultRecordV1 | null {
  const tid = id.trim();
  if (!tid) return null;
  return loadDoc().items.find((x) => x.id === tid) ?? null;
}

export function deleteSavedResult(id: string): void {
  const tid = id.trim();
  if (!tid) return;
  const doc = loadDoc();
  doc.items = doc.items.filter((x) => x.id !== tid);
  persistDoc(doc);
}

export type SaveSavedResultInput = {
  title: string;
  prompt: string;
  body: string;
  summary?: string;
  completedAt?: string;
  resultSourceDisplay: string;
  outputTrustDisplay: string;
  resultSources: ResultSource[];
  outputTrust: OutputTrust;
  savedWithFullLocal: boolean;
};

export function saveSavedResult(input: SaveSavedResultInput): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `sr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row: SavedResultRecordV1 = {
    v: 1,
    id,
    title: input.title.trim() || "—",
    prompt: input.prompt.trim(),
    body: input.body,
    summary: input.summary?.trim() || undefined,
    savedAt: new Date().toISOString(),
    completedAt: input.completedAt?.trim() || undefined,
    resultSourceDisplay: input.resultSourceDisplay,
    outputTrustDisplay: input.outputTrustDisplay,
    resultSources: input.resultSources.length ? [...input.resultSources] : ["fallback"],
    outputTrust: input.outputTrust,
    savedWithFullLocal: input.savedWithFullLocal
  };
  const doc = loadDoc();
  doc.items = [row, ...doc.items.filter((x) => x.id !== id)].slice(0, MAX_ITEMS);
  persistDoc(doc);
  return id;
}
