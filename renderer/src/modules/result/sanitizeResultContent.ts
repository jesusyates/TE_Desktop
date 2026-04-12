/**
 * 结果正文收口：在落入 UI / 导出前统一清洗，去除内部分析壳、历史串文特征与 mock 调试句。
 */

import type { ResultSource, TaskResult } from "./resultTypes";

export type SanitizeResultContentOptions = {
  /** 与正文比对，防止 prompt 被当作结果 */
  runPrompt?: string;
  resultSource?: ResultSource;
  /** 标题字段：更短、更严 */
  forTitle?: boolean;
};

const MOCK_DEBUG_RE = /mock output only|no ai model was invoked/gi;

const ROLE_LINE_RE = /^\s*(safety|librarian|strategist|planner|writer|critic)\s*[:：]/i;

/** 非 global，避免 .test 污染 lastIndex */
const ANALYSIS_TITLE_RE = /关于[\s\S]{0,200}?的分析与思考/;
const ANALYSIS_TITLE_RE_ALL = /关于[\s\S]{0,200}?的分析与思考/g;

/** 仅用于识别「整行/纯标题」行，避免误伤正文内偶然提及 */
const HEADING_LINE_RE = /^#+\s*(核心要点|深入分析|步骤与目的)\s*$/i;

function placeholderBody(source: ResultSource | undefined): string {
  switch (source) {
    case "mock":
      return "当前为占位说明，非完整生成正文。";
    case "fallback":
    case "error":
      return "当前为降级或异常占位说明，请以系统提示为准。";
    default:
      return "（正文已按安全规则精简，请重试或调整需求后再次生成。）";
  }
}

function looksLikeJsonOrWireDump(s: string): boolean {
  const t = s.trim();
  if (t.length < 80) return false;
  const braceHeavy = (t.match(/[{}]/g) ?? []).length > 12;
  const quoteHeavy = (t.match(/"/g) ?? []).length > 20;
  const startsJson = t.startsWith("{") || t.startsWith("[");
  return startsJson && (braceHeavy || quoteHeavy);
}

function similarityToPrompt(body: string, prompt: string): boolean {
  const b = body.trim();
  const p = prompt.trim();
  if (!p || p.length < 12) return false;
  if (b === p) return true;
  if (b.startsWith(p) && b.length <= p.length + 80) return true;
  if (p.length > 40 && b.length <= p.length * 1.05 && b.slice(0, p.length) === p) return true;
  return false;
}

function stripLinesMatching(text: string, predicate: (line: string) => boolean): string {
  return text
    .split("\n")
    .filter((line) => !predicate(line))
    .join("\n");
}

function paragraphFilter(text: string): string {
  const parts = text.split(/\n{2,}/);
  const kept = parts.filter((para) => {
    const p = para.trim();
    if (!p) return false;
    if (ANALYSIS_TITLE_RE.test(p)) return false;
    if (MOCK_DEBUG_RE.test(p)) return false;
    if (looksLikeJsonOrWireDump(p)) return false;
    const first = p.split("\n")[0]?.trim() ?? "";
    if (HEADING_LINE_RE.test(first)) return false;
    if (ROLE_LINE_RE.test(first)) return false;
    return true;
  });
  return kept.join("\n\n").trim();
}

/**
 * 清洗单段正文（title / body / summary 共用，forTitle 时略严）。
 */
export function sanitizeResultContent(
  raw: string,
  opts?: SanitizeResultContentOptions
): string {
  let t = (raw ?? "").replace(/\r\n/g, "\n");
  if (opts?.forTitle) {
    t = t.replace(ANALYSIS_TITLE_RE_ALL, "").replace(MOCK_DEBUG_RE, "").trim();
    return t.slice(0, 500);
  }

  t = t.replace(ANALYSIS_TITLE_RE_ALL, "");
  t = t.replace(MOCK_DEBUG_RE, "");
  t = stripLinesMatching(t, (line) => {
    const s = line.trim();
    if (!s) return false;
    if (ROLE_LINE_RE.test(s)) return true;
    if (HEADING_LINE_RE.test(s)) return true;
    if (MOCK_DEBUG_RE.test(s)) return true;
    return false;
  });

  t = paragraphFilter(t);

  if (opts?.runPrompt && similarityToPrompt(t, opts.runPrompt)) {
    return placeholderBody(opts.resultSource);
  }

  if (looksLikeJsonOrWireDump(t)) {
    return placeholderBody(opts?.resultSource);
  }

  const trimmed = t.trim();
  if (!trimmed || trimmed.length < 2) {
    return placeholderBody(opts?.resultSource);
  }

  return trimmed;
}

/**
 * 供 UI / 导出：返回新对象，不修改入参。
 */
export function sanitizeTaskResultForDisplay(tr: TaskResult): TaskResult {
  if (tr.kind !== "content") return tr;
  const meta = tr.metadata as Record<string, unknown> | undefined;
  const runPrompt = typeof meta?.runPrompt === "string" ? meta.runPrompt : undefined;
  const baseOpts: SanitizeResultContentOptions = { runPrompt, resultSource: tr.resultSource };

  const body = sanitizeResultContent(tr.body ?? "", baseOpts);
  const title = sanitizeResultContent(tr.title ?? "", { ...baseOpts, forTitle: true });
  const summary =
    tr.summary !== undefined ? sanitizeResultContent(tr.summary, baseOpts) : undefined;

  const nextTitle = title.trim() || "—";

  return {
    ...tr,
    title: nextTitle,
    body,
    ...(summary !== undefined ? { summary } : {})
  };
}
