/**
 * D-7-4H：原始模型 → ViewModel（唯一映射入口之一）。
 */

import type { ExecutionStep, ExecutionTask } from "../execution/execution.types";
import type { TaskHistoryListEntry } from "../modules/history/types";
import type { OutputTrust, ResultSource, TaskResult } from "../modules/result/resultTypes";
import { deriveHistoryListProvenance } from "../modules/history/historyListProvenance";
import type { ResultPackage } from "../types/task";
import { toTaskResult } from "../modules/result/resultAdapters";
import { executionTaskToDomainModel, taskResultToDomainModel } from "../domain";
import { peekExecutionDetailCache } from "../services/executionDetailLocalCache";
import type {
  ExecutionStepVM,
  HistoryItemVM,
  HistoryItemVMSource,
  ResultVM,
  TaskVM,
  TaskVMSource
} from "./types";

function inferExecutionTaskSource(task: ExecutionTask): TaskVMSource {
  if (task.id.startsWith("core:")) return "core";
  return "execution";
}

export function mapExecutionTaskToTaskVM(task: ExecutionTask): TaskVM {
  const d = executionTaskToDomainModel(task);
  return {
    id: d.id,
    prompt: d.prompt,
    status: d.status,
    source: inferExecutionTaskSource(task),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt ?? d.createdAt,
    plannerSource: task.plannerSource,
    runType: task.runType,
    sourceTaskId: task.sourceTaskId
  };
}

/** Workbench 时间线：会话 ExecutionStatus 与 ExecutionTask 并存时的轻量 VM */
export function mapWorkbenchTimelineToTaskVM(input: {
  taskId: string;
  prompt: string;
  status: string;
}): TaskVM {
  const id = input.taskId.trim();
  return {
    id,
    prompt: input.prompt,
    status: input.status,
    source: "workbench",
    createdAt: "",
    updatedAt: ""
  };
}

export function mapTaskResultToResultVM(
  result: TaskResult,
  meta?: { source?: string; hash?: string; hasCoreSync?: boolean }
): ResultVM {
  const d = taskResultToDomainModel(undefined, result, { hash: meta?.hash, hasCoreSync: meta?.hasCoreSync });
  const kind = d.kind === "content" || d.kind === "computer" ? d.kind : "unknown";
  return {
    kind,
    title: d.title?.trim() || "—",
    body: d.body,
    summary: (d.summary ?? "").trim(),
    source: meta?.source ?? "session",
    hash: d.hash,
    hasCoreSync: d.hasCoreSync
  };
}

/** 自任意 streamResult / unknown 的最小 VM（无正式 TaskResult 时） */
export function mapUnknownToResultVM(
  raw: unknown,
  meta?: { source?: string; hash?: string; hasCoreSync?: boolean }
): ResultVM | null {
  const tr = toTaskResult(raw);
  if (tr) return mapTaskResultToResultVM(tr, meta);
  return null;
}

/** ExecutionTask 的 result：优先统一 TaskResult，否则按 ResultPackage 映射 */
export function mapExecutionTaskResultToResultVM(task: ExecutionTask): ResultVM | null {
  const raw = task.result;
  if (raw == null) return null;
  const fromUnified = mapUnknownToResultVM(raw, { source: "execution-task" });
  if (fromUnified) return fromUnified;
  const o = raw as Record<string, unknown>;
  if (o && typeof o === "object" && typeof o.title === "string" && typeof o.body === "string") {
    return mapResultPackageToResultVM(raw as ResultPackage);
  }
  return null;
}

export function mapExecutionStepsToStepVMs(steps: ExecutionStep[] | null | undefined): ExecutionStepVM[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((step) => ({
    id: step.id,
    order: step.order,
    title: step.title,
    status: step.status,
    latencyMs: step.latency,
    errorText: step.error?.trim() ?? ""
  }));
}

/** D-7-4J：日志区统一序列化（与原先 JSON.stringify(logs, null, 2) 行为一致） */
export function serializeExecutionLogsForDisplay(logs: unknown): string {
  return JSON.stringify(logs ?? [], null, 2);
}

export function mapResultPackageToResultVM(pkg: ResultPackage): ResultVM {
  const tags = Array.isArray(pkg.tags) ? pkg.tags.join(", ") : "";
  const summaryParts = [pkg.hook, pkg.copywriting, tags].filter((s) => String(s).trim() !== "");
  return {
    kind: "unknown",
    title: pkg.title?.trim() || "—",
    body: pkg.body ?? "",
    summary: summaryParts.join(" · ") || pkg.hook || "",
    source: "result-package"
  };
}

function isTaskHistoryListEntry(v: ExecutionTask | TaskHistoryListEntry): v is TaskHistoryListEntry {
  const s = (v as TaskHistoryListEntry).source;
  return s === "core" || s === "local" || s === "server";
}

function provenanceFromExecutionTask(t: ExecutionTask): { resultSource: ResultSource; outputTrust: OutputTrust } {
  if (t.status === "failed") return { resultSource: "error", outputTrust: "error" };
  if (t.status === "cancelled") return { resultSource: "fallback", outputTrust: "non_authentic" };
  if (t.plannerSource === "remote") return { resultSource: "ai_result", outputTrust: "authentic" };
  return { resultSource: "mock", outputTrust: "non_authentic" };
}

function formalHistoryStatusFromListEntry(entry: TaskHistoryListEntry): string {
  if (entry.source === "server") return entry.status;
  if (entry.status === "failed") return "error";
  if (entry.status === "cancelled") return "stopped";
  return "success";
}

export function mapHistoryEntryToHistoryItemVM(entry: ExecutionTask | TaskHistoryListEntry): HistoryItemVM {
  if (isTaskHistoryListEntry(entry)) {
    const vmSource: HistoryItemVMSource =
      entry.source === "server" ? "server" : entry.source === "core" ? "core" : "local";
    const preview = (entry.preview || "").trim();
    const prompt = (entry.prompt || "").trim();
    const { resultSource, outputTrust } = deriveHistoryListProvenance(
      formalHistoryStatusFromListEntry(entry),
      entry.mode
    );
    const exId = entry.executionTaskId?.trim();
    /** J-1：server 行 id = historyId（与 workbench runId 一致）；title 仅 prompt */
    return {
      id: entry.id,
      title: prompt || "—",
      status: entry.status,
      source: vmSource,
      updatedAt: entry.updatedAt,
      createdAt: entry.createdAt,
      stepCount: 0,
      lastErrorSummary: undefined,
      hasDetailCache: exId ? peekExecutionDetailCache(exId) != null : false,
      prompt: prompt || undefined,
      preview: preview || undefined,
      mode: entry.mode,
      resultSource,
      outputTrust
    };
  }
  const t = entry;
  const src: HistoryItemVMSource = t.id.startsWith("core:") ? "core" : "execution";
  const { resultSource, outputTrust } = provenanceFromExecutionTask(t);
  const p = (t.prompt || "").trim();
  return {
    id: t.id,
    title: p || (t.result?.title ?? "").trim() || "—",
    status: t.status,
    source: src,
    updatedAt: t.updatedAt ?? t.createdAt,
    createdAt: t.createdAt,
    stepCount: Array.isArray(t.steps) ? t.steps.length : 0,
    lastErrorSummary: t.lastErrorSummary?.trim() || undefined,
    hasDetailCache: peekExecutionDetailCache(t.id) != null,
    /** 无步骤的摘要行（如 warm 引导）不带出 planner，避免误导读 */
    plannerSource:
      Array.isArray(t.steps) && t.steps.length > 0 ? t.plannerSource : undefined,
    resultSource,
    outputTrust
  };
}
