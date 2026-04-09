/**
 * Local Runtime：受控本地能力（无云端、无 AI）。
 * — 目录扫描 / 读文件：须用户在本 IPC 对话框内选择，不信任渲染进程路径。
 */
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { runLocalSafeFileOperation } from "./localSafeFileExecutor.js";

export type LocalRuntimeStepType =
  | "local_scan"
  | "local_read"
  | "local_text_transform"
  | "local_file_operation";

export type LocalRuntimeRunPayload =
  | { stepType: "local_scan"; input: Record<string, unknown> }
  | { stepType: "local_read"; input: Record<string, unknown> }
  | { stepType: "local_text_transform"; input: Record<string, unknown> }
  | { stepType: "local_file_operation"; input: Record<string, unknown> };

export type LocalRuntimeRunResult = {
  success: boolean;
  result?: unknown;
  logs: string[];
  riskLevel: "L1" | "L2";
};

const MAX_SCAN_ENTRIES = 500;
const MAX_READ_BYTES = 2 * 1024 * 1024; // 2 MiB

/** 仅允许常见文本/源码扩展名（用户仍可任选文件，非列表内则拒绝） */
const ALLOWED_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".mdx",
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".log",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".less",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".properties",
  ".gitignore",
  ".editorconfig",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".php",
  ".sql",
  ".graphql",
  ".svg"
]);

function pushLog(logs: string[], line: string): void {
  logs.push(line);
}

async function runLocalScan(
  parent: BrowserWindow | null,
  logs: string[]
): Promise<{ ok: boolean; data?: unknown }> {
  const pick = parent
    ? await dialog.showOpenDialog(parent, {
        title: "选择要扫描的文件夹",
        properties: ["openDirectory"],
        buttonLabel: "扫描此文件夹"
      })
    : await dialog.showOpenDialog({
        title: "选择要扫描的文件夹",
        properties: ["openDirectory"],
        buttonLabel: "扫描此文件夹"
      });
  if (pick.canceled || !pick.filePaths[0]) {
    pushLog(logs, "user_canceled_directory_picker");
    return { ok: false };
  }
  const root = path.normalize(pick.filePaths[0]);
  pushLog(logs, `scan_root:${root}`);
  try {
    const st = await fs.stat(root);
    if (!st.isDirectory()) {
      pushLog(logs, "not_a_directory");
      return { ok: false };
    }
  } catch (e) {
    pushLog(logs, `stat_error:${e instanceof Error ? e.message : String(e)}`);
    return { ok: false };
  }

  const entries: Array<{
    name: string;
    relativePath: string;
    isDirectory: boolean;
    size: number | null;
  }> = [];

  try {
    const dirents = await fs.readdir(root, { withFileTypes: true });
    let n = 0;
    for (const d of dirents) {
      if (n >= MAX_SCAN_ENTRIES) {
        pushLog(logs, `truncated_at_${MAX_SCAN_ENTRIES}`);
        break;
      }
      const name = d.name;
      const full = path.join(root, name);
      const isDirectory = d.isDirectory();
      let size: number | null = null;
      if (d.isFile()) {
        try {
          const fst = await fs.stat(full);
          size = fst.size;
        } catch {
          size = null;
        }
      }
      entries.push({
        name,
        relativePath: name,
        isDirectory,
        size
      });
      n += 1;
    }
  } catch (e) {
    pushLog(logs, `readdir_error:${e instanceof Error ? e.message : String(e)}`);
    return { ok: false };
  }

  pushLog(logs, `entry_count:${entries.length}`);
  return {
    ok: true,
    data: {
      directoryPath: root,
      entryCount: entries.length,
      truncated: entries.length >= MAX_SCAN_ENTRIES,
      entries
    }
  };
}

async function runLocalReadTextFile(
  parent: BrowserWindow | null,
  logs: string[]
): Promise<{ ok: boolean; data?: unknown }> {
  const dialogOpts = {
    title: "选择要读取的文本文件",
    properties: ["openFile" as const],
    buttonLabel: "读取",
    filters: [
      {
        name: "Text / code",
        extensions: [
          "txt",
          "md",
          "markdown",
          "csv",
          "json",
          "log",
          "ts",
          "tsx",
          "js",
          "jsx",
          "mjs",
          "cjs",
          "css",
          "html",
          "htm",
          "xml",
          "yaml",
          "yml",
          "toml",
          "ini",
          "sql",
          "sh",
          "py",
          "ps1",
          "go",
          "rs",
          "java",
          "cs",
          "php",
          "svg",
          "graphql",
          "mdx"
        ]
      },
      { name: "All files", extensions: ["*"] }
    ]
  };
  const pick = parent ? await dialog.showOpenDialog(parent, dialogOpts) : await dialog.showOpenDialog(dialogOpts);
  if (pick.canceled || !pick.filePaths[0]) {
    pushLog(logs, "user_canceled_file_picker");
    return { ok: false };
  }
  const filePath = path.normalize(pick.filePaths[0]);
  pushLog(logs, `read_target:${filePath}`);
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_TEXT_EXTENSIONS.has(ext)) {
    pushLog(logs, `disallowed_extension:${ext || "(none)"}`);
    return { ok: false };
  }
  let st;
  try {
    st = await fs.stat(filePath);
  } catch (e) {
    pushLog(logs, `stat_error:${e instanceof Error ? e.message : String(e)}`);
    return { ok: false };
  }
  if (!st.isFile()) {
    pushLog(logs, "not_a_file");
    return { ok: false };
  }
  if (st.size > MAX_READ_BYTES) {
    pushLog(logs, `file_too_large:${st.size}`);
    return { ok: false };
  }
  let buf: Buffer;
  try {
    buf = await fs.readFile(filePath);
  } catch (e) {
    pushLog(logs, `read_error:${e instanceof Error ? e.message : String(e)}`);
    return { ok: false };
  }
  const sample = buf.subarray(0, Math.min(buf.length, 65536));
  if (sample.includes(0)) {
    pushLog(logs, "binary_content_rejected");
    return { ok: false };
  }
  const text = buf.toString("utf8");
  pushLog(logs, `bytes:${buf.length},chars:${text.length}`);
  return {
    ok: true,
    data: {
      filePath,
      fileName: path.basename(filePath),
      byteLength: buf.length,
      charLength: text.length,
      text
    }
  };
}

function applyTextRule(text: string, rule: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  switch (rule) {
    case "dedupe_lines": {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const line of lines) {
        const key = line.trimEnd();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(line);
      }
      return out.join("\n");
    }
    case "strip_empty_lines":
      return lines.filter((l) => l.trim().length > 0).join("\n");
    case "sort_lines":
      return [...lines].sort((a, b) => a.localeCompare(b)).join("\n");
    case "trim_lines":
      return lines.map((l) => l.trimEnd()).join("\n");
    default:
      return lines.map((l) => l.trim()).join("\n");
  }
}

function runLocalTextTransform(input: Record<string, unknown>, logs: string[]): { ok: boolean; data?: unknown } {
  const text = typeof input.text === "string" ? input.text : "";
  const rule = typeof input.rule === "string" && input.rule.trim() ? input.rule.trim() : "trim_lines";
  pushLog(logs, `rule:${rule}`);
  const out = applyTextRule(text, rule);
  return {
    ok: true,
    data: { rule, inputLength: text.length, outputLength: out.length, text: out }
  };
}

export async function runLocalCapability(
  parent: BrowserWindow | null,
  payload: LocalRuntimeRunPayload
): Promise<LocalRuntimeRunResult> {
  const logs: string[] = [];
  if (payload.stepType === "local_scan") {
    const scan = await runLocalScan(parent, logs);
    if (!scan.ok) {
      return { success: false, logs, riskLevel: "L1" };
    }
    return { success: true, result: scan.data, logs, riskLevel: "L1" };
  }
  if (payload.stepType === "local_read") {
    const read = await runLocalReadTextFile(parent, logs);
    if (!read.ok) {
      return { success: false, logs, riskLevel: "L1" };
    }
    return { success: true, result: read.data, logs, riskLevel: "L1" };
  }
  if (payload.stepType === "local_text_transform") {
    const tr = runLocalTextTransform(payload.input, logs);
    if (!tr.ok) {
      return { success: false, logs, riskLevel: "L1" };
    }
    return { success: true, result: tr.data, logs, riskLevel: "L1" };
  }
  if (payload.stepType === "local_file_operation") {
    const op = await runLocalSafeFileOperation(parent, payload.input, logs);
    if (!op.ok || !op.data) {
      return { success: false, logs, riskLevel: "L2" };
    }
    return { success: true, result: op.data, logs, riskLevel: "L2" };
  }
  pushLog(logs, `unsupported_step:${String((payload as { stepType?: string }).stepType)}`);
  return { success: false, logs, riskLevel: "L1" };
}
