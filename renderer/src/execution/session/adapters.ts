import type { ExecutionActionName, ExecutionStep, StepStatus } from "../execution.types";
import type { MockLogLine } from "./useMockExecutionLogStream";

const STEP_STATUSES: ReadonlySet<string> = new Set(["pending", "running", "success", "failed", "skipped"]);

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function pickString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  return undefined;
}

function stableLogId(index: number, text: string): string {
  const t = text.slice(0, 48);
  return `log-${index}-${t.length}-${hashSimple(t)}`;
}

function hashSimple(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/**
 * 将后端任意 log 条目适配为单行展示文案（不泄漏原始 JSON 到 UI）。
 */
function logEntryToText(entry: unknown): string {
  if (entry == null) return "";
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object") return String(entry);
  const o = entry as Record<string, unknown>;
  const content = pickString(o.content);
  if (content) return content;
  const msg = pickString(o.message);
  if (msg) return msg;
  const out = o.output;
  if (out && typeof out === "object") {
    const om = pickString((out as Record<string, unknown>).message);
    if (om) return om;
    const oc = pickString((out as Record<string, unknown>).content);
    if (oc) return oc;
  }
  if (pickString(o.status)) {
    const parts = [pickString(o.level), pickString(o.status), pickString(o.stepId)].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  try {
    return JSON.stringify(entry);
  } catch {
    return String(entry);
  }
}

/** 后端 logs → 日志流列表（与 MockLogLine 对齐）。 */
export function adaptLogs(rawLogs: unknown): MockLogLine[] {
  if (!Array.isArray(rawLogs)) return [];
  const out: MockLogLine[] = [];
  rawLogs.forEach((entry, index) => {
    const text = logEntryToText(entry).trim();
    if (!text) return;
    out.push({ id: stableLogId(index, text), text });
  });
  return out;
}

function normalizeStepStatus(raw: unknown): StepStatus {
  const s = typeof raw === "string" ? raw.toLowerCase() : "";
  if (STEP_STATUSES.has(s)) return s as StepStatus;
  return "pending";
}

function normalizeAction(raw: unknown): ExecutionActionName {
  const a = typeof raw === "string" ? raw : "";
  if (a === "generate-content" || a === "transform-data" || a === "call-api" || a === "save-memory") {
    return a;
  }
  return "call-api";
}

/** 后端 steps → ExecutionStep[] */
export function adaptSteps(rawSteps: unknown): ExecutionStep[] {
  if (!Array.isArray(rawSteps)) return [];
  return rawSteps.map((item, i) => {
    const o = asRecord(item);
    const order = Number(o.order ?? o.stepOrder ?? i + 1) || i + 1;
    const id = String(o.id ?? `step-${order}`);
    const title = String(o.title ?? `Step ${order}`);
    const input = asRecord(o.input);
    const output = o.output !== undefined && o.output !== null ? asRecord(o.output) : undefined;
    const err = pickString(o.error);
    return {
      id,
      title,
      order,
      action: normalizeAction(o.action ?? o.actionName),
      status: normalizeStepStatus(o.status),
      input,
      output: output && Object.keys(output).length ? output : undefined,
      error: err,
      latency: typeof o.latency === "number" ? o.latency : Number(o.latency ?? 0) || 0
    };
  });
}

/** Result 卡片所需扁平结构（UI 仅用此类型，不直接读后端对象）。 */
export type AdaptedResultCard = {
  title: string;
  body: string;
  stepCount: number | null;
  /** 可选展示；无则 UI 沿用 mock 占位 */
  durationLabel: string | null;
};

/** 后端 task.result → 卡片模型 */
export function adaptResult(rawResult: unknown): AdaptedResultCard | null {
  if (rawResult == null) return null;
  if (typeof rawResult !== "object") return null;
  const o = rawResult as Record<string, unknown>;
  if (o.type === "content" && typeof o.title === "string" && typeof o.body === "string") {
    const stepCount = typeof o.stepCount === "number" ? o.stepCount : null;
    const durationLabel =
      typeof o.durationMs === "number" ? `${o.durationMs} ms` : null;
    return {
      title: o.title.trim() || "Content Result",
      body: o.body,
      stepCount,
      durationLabel
    };
  }
  if (o.type === "computer") {
    const summary = pickString(o.summary);
    if (summary) {
      return {
        title: "Computer execution",
        body: summary,
        stepCount: null,
        durationLabel: null
      };
    }
  }
  const title = String(o.title ?? "").trim();
  const bodyRaw = o.body ?? o.content ?? "";
  const body = typeof bodyRaw === "string" ? bodyRaw.trim() : String(bodyRaw ?? "").trim();
  if (!title && !body) return null;
  const stepCount =
    typeof o.stepCount === "number"
      ? o.stepCount
      : Array.isArray(o.steps)
        ? o.steps.length
        : null;
  const durationLabel =
    typeof o.durationLabel === "string"
      ? o.durationLabel
      : typeof o.duration === "string"
        ? o.duration
        : null;
  return {
    title: title || body.slice(0, 40) || "—",
    body: body || title,
    stepCount,
    durationLabel
  };
}
