/**
 * D-7-5B：风格偏好本地持久化（禁止页面直接操作 localStorage）。
 */

import type {
  StyleOutputLength,
  StylePreferencesSnapshot
} from "../types/stylePreferences";
import { decodeLocalStorageDocument, encodeLocalStorageDocument } from "./localDataSafety";

const STORAGE_KEY = "aics.stylePreferences.v1";

type StylePreferencesDocV1 = {
  v: 1;
  tone?: string;
  audience?: string;
  outputLength?: StyleOutputLength;
  languagePreference?: string;
  notes?: string;
};

function defaultDoc(): StylePreferencesDocV1 {
  return { v: 1 };
}

function loadDoc(): StylePreferencesDocV1 {
  if (typeof window === "undefined") return defaultDoc();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultDoc();
    const decoded = decodeLocalStorageDocument<StylePreferencesDocV1>(raw, "stylePreferences");
    if (decoded && typeof decoded === "object" && decoded.v === 1) {
      return { ...defaultDoc(), ...decoded };
    }
  } catch {
    /* ignore */
  }
  return defaultDoc();
}

function saveDoc(doc: StylePreferencesDocV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, encodeLocalStorageDocument(doc));
  } catch {
    /* quota */
  }
}

/** 设置页表单（允许空串，与快照区分） */
export type StylePreferencesFormState = {
  tone: string;
  audience: string;
  outputLength: StyleOutputLength | "";
  languagePreference: string;
  notes: string;
};

export function loadStylePreferencesForm(): StylePreferencesFormState {
  const d = loadDoc();
  return {
    tone: typeof d.tone === "string" ? d.tone : "",
    audience: typeof d.audience === "string" ? d.audience : "",
    outputLength: d.outputLength === "short" || d.outputLength === "medium" || d.outputLength === "long" ? d.outputLength : "",
    languagePreference: typeof d.languagePreference === "string" ? d.languagePreference : "",
    notes: typeof d.notes === "string" ? d.notes : ""
  };
}

export function persistStylePreferencesForm(form: StylePreferencesFormState): void {
  const tone = form.tone.trim();
  const audience = form.audience.trim();
  const languagePreference = form.languagePreference.trim();
  const notes = form.notes.trim();
  const outputLength =
    form.outputLength === "short" || form.outputLength === "medium" || form.outputLength === "long"
      ? form.outputLength
      : undefined;
  saveDoc({
    v: 1,
    ...(tone ? { tone } : {}),
    ...(audience ? { audience } : {}),
    ...(outputLength ? { outputLength } : {}),
    ...(languagePreference ? { languagePreference } : {}),
    ...(notes ? { notes } : {})
  });
}

/** 供 `session.start` 同步读取；不触发 I/O 之外逻辑 */
export function getStylePreferencesSnapshot(): StylePreferencesSnapshot {
  const d = loadDoc();
  const out: StylePreferencesSnapshot = {};
  const tone = typeof d.tone === "string" ? d.tone.trim() : "";
  const audience = typeof d.audience === "string" ? d.audience.trim() : "";
  const languagePreference = typeof d.languagePreference === "string" ? d.languagePreference.trim() : "";
  const notes = typeof d.notes === "string" ? d.notes.trim() : "";
  if (tone) out.tone = tone;
  if (audience) out.audience = audience;
  if (d.outputLength === "short" || d.outputLength === "medium" || d.outputLength === "long") {
    out.outputLength = d.outputLength;
  }
  if (languagePreference) out.languagePreference = languagePreference;
  if (notes) out.notes = notes;
  return out;
}
