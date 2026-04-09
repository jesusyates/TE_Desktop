/**
 * Result Package / Export v1：正式结果包文案构建与导出（txt/md），元数据字段不写入历史持久化逻辑。
 */
import type { TaskResult } from "../modules/result/resultTypes";
import { isLocalRuntimeSummaryOnlyForPersistence } from "../modules/result/taskResultLocalRetention";
import { exportTextFileWithDialog, sanitizeExportFileBase } from "./localRuntimeService";
import type { ExportResultOutcome } from "./localRuntimeService";

export type ResultPackageFieldLabels = {
  sectionMeta: string;
  sectionResult: string;
  fieldPrompt: string;
  fieldCreatedAt: string;
  fieldResultSource: string;
  fieldOutputTrust: string;
  fieldTitle: string;
  fieldSummary: string;
  noteLocalSummaryExport?: string;
};

export type ResultPackageBuildInput = {
  title: string;
  body: string;
  summary?: string;
  prompt: string;
  createdAtIso: string;
  resultSourceDisplay: string;
  outputTrustDisplay: string;
  labels: ResultPackageFieldLabels;
};

function formatMarkdownPrompt(prompt: string, label: string): string {
  const p = prompt.trim() || "—";
  if (p.includes("\n")) {
    return `- **${label}**\n\n\`\`\`\n${p}\n\`\`\`\n`;
  }
  return `- **${label}** ${p}\n`;
}

export function buildResultPackageMarkdown(p: ResultPackageBuildInput): string {
  const lines: string[] = [`# ${p.labels.sectionMeta}`, "", formatMarkdownPrompt(p.prompt, p.labels.fieldPrompt)];
  lines.push(
    `- **${p.labels.fieldCreatedAt}** ${p.createdAtIso}`,
    `- **${p.labels.fieldResultSource}** ${p.resultSourceDisplay}`,
    `- **${p.labels.fieldOutputTrust}** ${p.outputTrustDisplay}`,
    ""
  );
  if (p.labels.noteLocalSummaryExport) {
    lines.push(`> ${p.labels.noteLocalSummaryExport}`, "");
  }
  const hTitle = (p.title || "").trim() || "—";
  lines.push(`# ${p.labels.sectionResult}`, "", `## ${hTitle}`, "");
  const sumT = p.summary?.trim() ?? "";
  const bodyT = (p.body || "—").trim();
  if (sumT && sumT !== bodyT) {
    lines.push(`### ${p.labels.fieldSummary}`, "", sumT, "", "---", "");
  }
  lines.push(bodyT);
  return `${lines.join("\n")}\n`;
}

export function buildResultPackagePlainText(p: ResultPackageBuildInput): string {
  const parts: string[] = [
    `=== ${p.labels.sectionMeta} ===`,
    "",
    `${p.labels.fieldPrompt}`,
    p.prompt.trim() || "—",
    "",
    `${p.labels.fieldCreatedAt}`,
    p.createdAtIso,
    "",
    `${p.labels.fieldResultSource}`,
    p.resultSourceDisplay,
    "",
    `${p.labels.fieldOutputTrust}`,
    p.outputTrustDisplay,
    ""
  ];
  if (p.labels.noteLocalSummaryExport) {
    parts.push(`(${p.labels.noteLocalSummaryExport})`, "");
  }
  parts.push(
    `=== ${p.labels.sectionResult} ===`,
    "",
    (p.title || "").trim() || "—",
    ""
  );
  const sumT = p.summary?.trim() ?? "";
  const bodyT = (p.body || "—").trim();
  if (sumT && sumT !== bodyT) {
    parts.push(`${p.labels.fieldSummary}`, sumT, "", "");
  }
  parts.push(bodyT);
  return `${parts.join("\n")}\n`;
}

export function resolveExportBodies(
  unified: TaskResult | null,
  mode: "default" | "full"
): { title: string; body: string; summary?: string } {
  if (!unified) {
    return { title: "", body: "", summary: undefined };
  }
  if (unified.kind === "computer") {
    const body = (unified.body ?? unified.summary ?? "").trim();
    return {
      title: (unified.title ?? "").trim(),
      body,
      summary: unified.summary?.trim()
    };
  }
  const full = (unified.body ?? "").trim();
  const sum = (unified.summary ?? "").trim();
  const useSummaryDefault = mode === "default" && isLocalRuntimeSummaryOnlyForPersistence(unified);
  const body = useSummaryDefault ? (sum || full) : full;
  return {
    title: (unified.title ?? "").trim(),
    body,
    summary: sum || undefined
  };
}

export function localRuntimeCanExportFullBody(unified: TaskResult | null): boolean {
  if (!unified || unified.kind !== "content") return false;
  if (!isLocalRuntimeSummaryOnlyForPersistence(unified)) return false;
  const def = resolveExportBodies(unified, "default").body;
  const full = resolveExportBodies(unified, "full").body;
  if (full.length !== def.length) return true;
  return full !== def;
}

export async function exportResultPackageFile(
  format: "md" | "txt",
  input: ResultPackageBuildInput,
  titleForFileName: string
): Promise<ExportResultOutcome> {
  const base = sanitizeExportFileBase(titleForFileName.trim() || "aics-result-pack");
  const defaultPath = format === "md" ? `${base}.md` : `${base}.txt`;
  const content =
    format === "md" ? buildResultPackageMarkdown(input) : buildResultPackagePlainText(input);
  return exportTextFileWithDialog({
    content,
    defaultPath,
    mime: format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8"
  });
}

export async function copyResultPackageToClipboard(
  format: "md" | "txt",
  input: ResultPackageBuildInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const text =
    format === "md" ? buildResultPackageMarkdown(input) : buildResultPackagePlainText(input);
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    }
    return { ok: false, error: "clipboard_unavailable" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
