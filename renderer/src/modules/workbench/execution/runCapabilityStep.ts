/**
 * F-2A：本地 capability 步执行（纯字符串处理，可捕获错误）。
 */
import type { TaskResult } from "../../result/resultTypes";
import type { ExecutionPlanStep } from "./executionPlanTypes";
export type RunCapabilityStepContext = {
  /** 用户任务原文，作为默认输入文本 */
  basePrompt: string;
  /** 当前步之前已完成的步骤结果（有序） */
  priorResults: TaskResult[];
};

export type RunCapabilityStepSuccess = {
  ok: true;
  title: string;
  body: string;
  summary: string;
};

export type RunCapabilityStepFailure = {
  ok: false;
  error: string;
};

export type RunCapabilityStepResult = RunCapabilityStepSuccess | RunCapabilityStepFailure;

function resolveInputText(step: ExecutionPlanStep, ctx: RunCapabilityStepContext): string {
  const payload = step.input.payload;
  if (payload && typeof payload === "object" && payload !== null && "text" in payload) {
    const t = (payload as { text?: unknown }).text;
    if (typeof t === "string") return t;
  }
  const source =
    payload && typeof payload === "object" && payload !== null && "source" in payload
      ? String((payload as { source?: unknown }).source ?? "user_prompt")
      : "user_prompt";
  if (source === "prior_step" && ctx.priorResults.length) {
    const chunks = ctx.priorResults
      .filter((r): r is Extract<TaskResult, { kind: "content" }> => r.kind === "content")
      .map((r) => (r.body || r.summary || "").trim())
      .filter(Boolean);
    if (chunks.length) return chunks.join("\n\n");
  }
  return ctx.basePrompt.trim();
}

function opRemoveDuplicates(text: string): string {
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === "") {
      out.push(line);
      continue;
    }
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(line);
  }
  return out.join("\n");
}

function opExtractUrls(text: string): string {
  const re = /https?:\/\/[^\s\u4e00-\u9fff\]\)\>\"\'\,]+|www\.[^\s\u4e00-\u9fff\]\)\>\"\'\,]+/gi;
  const matches = text.match(re);
  if (!matches?.length) return "（未检测到 URL）";
  const normalized = matches.map((m) => m.replace(/[.,;:\)\]\>\"\'\,]+$/, ""));
  const unique = [...new Set(normalized)];
  return unique.map((u, i) => `${i + 1}. ${u}`).join("\n");
}

function opLinesToNumberedList(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return "（无有效行）";
  return lines.map((l, i) => `${i + 1}. ${l.trim()}`).join("\n");
}

/**
 * 执行单个 capability 步骤；不调外部 I/O。
 */
export function runCapabilityStep(step: ExecutionPlanStep, ctx: RunCapabilityStepContext): RunCapabilityStepResult {
  if (step.type !== "capability") {
    return { ok: false, error: "step_not_capability" };
  }
  const capType = String(step.input.capabilityType ?? "");
  const operation = String(step.input.operation ?? "");
  try {
    const text = resolveInputText(step, ctx);
    if (operation === "text_transform.remove_duplicates" && capType === "text_transform") {
      const nonEmptyBefore = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
      const body = opRemoveDuplicates(text);
      const nonEmptyAfter = body.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
      const removed = Math.max(0, nonEmptyBefore - nonEmptyAfter);
      return {
        ok: true,
        title: "去重整理结果",
        body,
        summary:
          nonEmptyBefore === 0
            ? "原文没有非空行，未做去重调整。"
            : `去重完成：原有 ${nonEmptyBefore} 条非空行，合并重复后保留 ${nonEmptyAfter} 条；约 ${removed} 条为重复已省略。空行仍保留在原位置。`
      };
    }
    if (operation === "data_extract.extract_urls" && capType === "data_extract") {
      const body = opExtractUrls(text);
      const count = body.startsWith("（未") ? 0 : body.split(/\r?\n/).length;
      return {
        ok: true,
        title: "链接提取结果",
        body,
        summary: count
          ? `共提取到 ${count} 条链接（列表内已去重）。如需核对，请展开下方完整列表。`
          : "未在文本中匹配到可识别的链接；请确认原文含 http(s) 或 www 形式地址。"
      };
    }
    if (operation === "format_convert.lines_to_numbered_list" && capType === "format_convert") {
      const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const body = opLinesToNumberedList(text);
      const n = rawLines.length;
      if (n === 0) {
        return {
          ok: true,
          title: "编号列表",
          body,
          summary: "没有可转换的非空行，输出为空状态说明。"
        };
      }
      const previewLines = rawLines.slice(0, 2).map((l) => {
        const t = l.trim();
        return t.length > 40 ? `${t.slice(0, 39)}…` : t;
      });
      const preview = previewLines.map((t, i) => `${i + 1}. ${t}`).join("；");
      return {
        ok: true,
        title: "编号列表",
        body,
        summary:
          n > 2
            ? `转换成功：共 ${n} 行已加编号。预览：${preview}…（完整结果见正文）`
            : `转换成功：共 ${n} 行已加编号。预览：${preview}`
      };
    }
    return { ok: false, error: `unsupported_capability:${capType}.${operation}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
