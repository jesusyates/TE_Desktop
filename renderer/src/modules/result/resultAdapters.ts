import type { ComputerResultLike, ContentExecutionResult } from "../content/contentResultTypes";
import type { TemplateResultSnapshot } from "../templates/types/template";
import type { ResultPackage } from "../../types/task";
import type {
  ComputerTaskResult,
  ContentTaskResult,
  TaskResult
} from "./resultTypes";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function isTaskResult(v: unknown): v is TaskResult {
  const o = asRecord(v);
  if (!o) return false;
  return o.kind === "content" || o.kind === "computer";
}

/** 自 ContentExecutor 产物 */
function fromContentExecutionResult(c: ContentExecutionResult): ContentTaskResult {
  return {
    kind: "content",
    title: c.title,
    summary: c.summary,
    body: c.body,
    action: c.action,
    stepCount: c.stepCount,
    durationMs: c.durationMs,
    resultSource: c.resultSource,
    metadata: { ...(c.metadata ?? {}), _source: "content_executor" as const }
  };
}

/** 自旧 ComputerResultLike */
function fromComputerResultLike(c: ComputerResultLike): ComputerTaskResult {
  const summary = c.summary?.trim();
  return {
    kind: "computer",
    title: "Computer execution",
    summary,
    body: summary,
    metadata: { ...(c.metadata ?? {}), _source: "computer_placeholder" as const }
  };
}

/** 自模板/历史快照结构 */
function fromTemplateResultSnapshot(s: TemplateResultSnapshot): ContentTaskResult {
  return {
    kind: "content",
    title: s.title,
    body: s.bodyPreview,
    summary: undefined,
    stepCount: s.stepCount,
    metadata: { _source: "template_result_snapshot" as const, durationLabel: s.durationLabel }
  };
}

/**
 * 后端或历史任意 result 对象（与 adaptResult 同源启发式）
 */
function fromLegacyStreamResult(raw: Record<string, unknown>): TaskResult | null {
  const title = String(raw.title ?? "").trim();
  const bodyRaw = raw.body ?? raw.content ?? raw.bodyPreview ?? "";
  const body = typeof bodyRaw === "string" ? bodyRaw.trim() : String(bodyRaw ?? "").trim();
  if (!title && !body) return null;
  const stepCount =
    typeof raw.stepCount === "number"
      ? raw.stepCount
      : Array.isArray(raw.steps)
        ? raw.steps.length
        : undefined;
  const durationMs =
    typeof raw.durationMs === "number"
      ? raw.durationMs
      : typeof raw.duration === "number"
        ? raw.duration
        : undefined;
  const kindRaw = raw.kind;
  if (kindRaw === "computer") {
    return {
      kind: "computer",
      title: title || "Computer execution",
      summary: pickString(raw.summary),
      body: body || pickString(raw.summary),
      environmentLabel: pickString(raw.environmentLabel),
      targetApp: pickString(raw.targetApp),
      stepCount,
      eventCount: typeof raw.eventCount === "number" ? raw.eventCount : undefined,
      metadata: { _source: "legacy_stream" as const }
    };
  }
  return {
    kind: "content",
    title: title || body.slice(0, 48) || "Result",
    body: body || title,
    summary: pickString(raw.summary),
    action: pickString(raw.action),
    stepCount,
    durationMs,
    metadata: { _source: "legacy_stream" as const }
  };
}

/** D-5-8 过渡形态：type: content | computer */
function fromD58Shape(raw: Record<string, unknown>): TaskResult | null {
  const t = raw.type;
  if (t === "content" && typeof raw.title === "string" && typeof raw.body === "string") {
    return fromContentExecutionResult(raw as unknown as ContentExecutionResult);
  }
  if (t === "computer") {
    return fromComputerResultLike(raw as unknown as ComputerResultLike);
  }
  return null;
}

/**
 * 统一入口：executor 产物 / 旧快照 / streamResult → TaskResult。
 */
export function toTaskResult(input: unknown): TaskResult | null {
  if (input == null) return null;
  if (isTaskResult(input)) return input;

  const o = asRecord(input);
  if (!o) return null;

  const d58 = fromD58Shape(o);
  if (d58) return d58;

  if (
    typeof o.title === "string" &&
    typeof o.bodyPreview === "string" &&
    typeof o.stepCount === "number"
  ) {
    return fromTemplateResultSnapshot(input as TemplateResultSnapshot);
  }

  return fromLegacyStreamResult(o);
}

export type ResultCardView = {
  title: string;
  body: string;
  stepCount: number | null;
  durationLabel: string | null;
};

/**
 * 卡片/列表展示用扁平字段（ExecutionResultPanel、模板详情等）。
 */
export function toResultCardView(result: TaskResult): ResultCardView {
  if (result.kind === "content") {
    return {
      title: result.title,
      body: result.body,
      stepCount: result.stepCount ?? null,
      durationLabel: result.durationMs != null ? `${result.durationMs} ms` : null
    };
  }
  const body = result.body ?? result.summary ?? "";
  return {
    title: result.title,
    body,
    stepCount: result.stepCount ?? null,
    durationLabel: null
  };
}

/**
 * 写入模板库的 resultSnapshot（唯一推荐写路径）。
 */
/** D-7-4G：Execution 详情缓存中的 TaskResult → legacy ResultPackage（历史回放/结果页） */
export function taskResultToResultPackage(tr: TaskResult): ResultPackage {
  const body = tr.body ?? tr.summary ?? "";
  return {
    title: tr.title?.trim() || "—",
    hook: (tr.summary ?? "").trim(),
    contentStructure: "",
    body,
    copywriting: "",
    tags: [],
    publishSuggestion: ""
  };
}

export function toTemplateResultSnapshot(result: TaskResult): TemplateResultSnapshot {
  const previewSource = result.kind === "content" ? result.body : (result.body ?? result.summary ?? "");
  const bodyPreview =
    previewSource.length > 800 ? `${previewSource.slice(0, 800)}…` : previewSource;
  return {
    title: result.title,
    bodyPreview,
    stepCount: result.stepCount ?? 0,
    durationLabel:
      result.kind === "content" && result.durationMs != null ? `${result.durationMs} ms` : null
  };
}

export { toComputerTaskResult } from "../computer/lib/computerResult";
