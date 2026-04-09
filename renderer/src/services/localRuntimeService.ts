/**
 * D-7-4X：Local Runtime — 结果导出与最近导出路径（单点收口，页面禁止直接写 localStorage）。
 */

import type { AicsDesktopApi } from "../types/desktopRuntime";
import { decodeLocalStorageDocument, encodeLocalStorageDocument } from "./localDataSafety";

const LOCAL_RUNTIME_STORAGE_KEY = "aics.localRuntime.v1";

type LocalRuntimeDocV1 = {
  v: 1;
  lastExportPath?: string;
  lastExportAt?: string;
};

function defaultDoc(): LocalRuntimeDocV1 {
  return { v: 1 };
}

function loadDoc(): LocalRuntimeDocV1 {
  if (typeof window === "undefined") return defaultDoc();
  try {
    const raw = window.localStorage.getItem(LOCAL_RUNTIME_STORAGE_KEY);
    if (!raw) return defaultDoc();
    const decoded = decodeLocalStorageDocument<LocalRuntimeDocV1>(raw, "localRuntime");
    if (decoded && typeof decoded === "object" && decoded.v === 1) {
      return { ...defaultDoc(), ...decoded };
    }
  } catch {
    /* ignore */
  }
  return defaultDoc();
}

function saveDoc(next: LocalRuntimeDocV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_RUNTIME_STORAGE_KEY, encodeLocalStorageDocument(next));
  } catch {
    /* quota */
  }
}

function getDesktopApi(): AicsDesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { aicsDesktop?: AicsDesktopApi }).aicsDesktop;
}

export function getLastExportPathForDisplay(): string | null {
  const p = loadDoc().lastExportPath?.trim();
  return p || null;
}

export function rememberSuccessfulExportPath(filePath: string): void {
  const pathNorm = filePath.trim();
  if (!pathNorm) return;
  const cur = loadDoc();
  saveDoc({
    ...cur,
    v: 1,
    lastExportPath: pathNorm,
    lastExportAt: new Date().toISOString()
  });
}

export function buildResultExportMarkdown(payload: {
  title: string;
  body: string;
  summary?: string;
}): string {
  const title = payload.title.trim() || "未命名结果";
  const body = payload.body.trim();
  const summary = payload.summary?.trim();
  const lines = [`# ${title}`, ""];
  if (summary) {
    lines.push("## 摘要", "", summary, "", "---", "");
  }
  lines.push("## 正文", "", body || "—");
  return `${lines.join("\n")}\n`;
}

export function sanitizeExportFileBase(name: string): string {
  const n = name.replace(/[/\\?%*:|"<>]/g, "_").trim().slice(0, 120);
  return n || "aics-result";
}

/**
 * 将文本写入用户选择的路径（Electron 对话框或浏览器下载）。
 */
export async function exportTextFileWithDialog(opts: {
  content: string;
  defaultPath: string;
  /** 浏览器 Blob MIME，默认纯文本 */
  mime?: string;
}): Promise<ExportResultOutcome> {
  const api = getDesktopApi();
  if (api?.saveTextFile) {
    try {
      const r = await api.saveTextFile({ defaultPath: opts.defaultPath, content: opts.content });
      if (r.ok && r.filePath?.trim()) {
        rememberSuccessfulExportPath(r.filePath);
        return { ok: true, filePath: r.filePath };
      }
      return { ok: false, canceled: Boolean((r as { canceled?: boolean }).canceled) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  try {
    const blob = new Blob([opts.content], { type: opts.mime ?? "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = opts.defaultPath;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    rememberSuccessfulExportPath(opts.defaultPath);
    return { ok: true, filePath: opts.defaultPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ExportResultOutcome =
  | { ok: true; filePath: string }
  | { ok: false; canceled?: boolean; error?: string };

/**
 * 将当前结果导出为 Markdown；Electron 下走保存对话框并记录完整路径，否则降级为浏览器下载（仅记录文件名）。
 */
export async function exportResultAsMarkdown(payload: {
  title: string;
  body: string;
  summary?: string;
}): Promise<ExportResultOutcome> {
  const content = buildResultExportMarkdown(payload);
  const base = sanitizeExportFileBase(payload.title.trim() || "aics-result");
  return exportTextFileWithDialog({
    content,
    defaultPath: `${base}.md`,
    mime: "text/markdown;charset=utf-8"
  });
}
