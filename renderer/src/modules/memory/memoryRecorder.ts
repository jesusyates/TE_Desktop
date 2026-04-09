/**
 * D-2：本模块仅维护 **本地** MemorySnapshot（行为日志 / pattern / 统计）。
 * 归档到 AICS Core 的长期记忆 **必须** 走 `memoryWriteService`（受控 memoryType），禁止在此直调 `postMemoryRecordToCore`。
 */
import type { TaskAnalysisResult } from "../workbench/analyzer/taskAnalyzerTypes";
import type { ExecutionPlan } from "../workbench/execution/executionPlanTypes";
import type { TaskResult } from "../result/resultTypes";
import { toTaskResult } from "../result/resultAdapters";
import { hashMemoryRecordContentAsync } from "../../services/contentHash";
import { extractCapabilityIdsFromStepsSnapshot } from "./memoryTemplateSignals";
import { patternKeyFromAnalysis } from "./memoryQuery";
import { loadMemorySnapshot, saveMemorySnapshot } from "./memoryStore";
import type { MemoryFailureSignal, MemoryFailureType, MemorySnapshot, MemorySuccessQuality, UserBehaviorMemory } from "./memoryTypes";

/** D-7-4Q：会话侧提供的轻量失败上下文（用于 failureType 推断，无远程） */
export type RecordTaskExecutionFailureContext = {
  safetyDecision?: SafetyDecisionLike;
  permissionDecision?: PermissionDecisionLike;
  lastErrorMessage?: string;
  emergencyStop?: boolean;
  userInitiatedStop?: boolean;
  budgetExceeded?: boolean;
};

type SafetyDecisionLike = "clear" | "warn" | "block" | string | null | undefined;
type PermissionDecisionLike = "allow" | "warn" | "confirm" | "block" | string | null | undefined;

export type RecordTaskExecutionInput = {
  prompt: string;
  requestedMode: TaskAnalysisResult["requestedMode"];
  resolvedMode: TaskAnalysisResult["resolvedMode"];
  analysis: TaskAnalysisResult;
  /** F-1：标准执行计划 */
  executionPlan: ExecutionPlan | null;
  stepResults: Record<string, TaskResult>;
  currentResult: TaskResult | null;
  success: boolean;
  /** D-7-4O：事件流步骤/结果（与 currentPlan/currentResult 合并沉淀） */
  streamSteps?: unknown[] | null;
  streamResult?: unknown | null;
  /** D-7-4P：warn/降级提示（不改变 success） */
  executionQualityContext?: { hadDegradedOrWarn: boolean };
  /** D-7-4Q：失败时写入 failureSignal 的判定依据 */
  failureContext?: RecordTaskExecutionFailureContext;
};

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function deriveCapabilityIdsFromExecutionPlan(plan: ExecutionPlan | null): string[] {
  if (!plan?.steps.length) return [];
  const out: string[] = [];
  for (const s of plan.steps) {
    const id = s.input.deferredCapabilityId;
    if (typeof id === "string" && id.trim()) out.push(id.trim());
  }
  return out;
}

function mergeCapabilityIds(plan: ExecutionPlan | null, streamSteps: unknown[] | null | undefined): string[] {
  const a = deriveCapabilityIdsFromExecutionPlan(plan);
  const b = extractCapabilityIdsFromStepsSnapshot(streamSteps ?? []);
  return [...new Set([...a, ...b])];
}

function deriveStepIds(plan: ExecutionPlan | null): string[] {
  return plan?.steps.map((s) => s.stepId) ?? [];
}

function resultKindFromResult(r: TaskResult | null): UserBehaviorMemory["resultKind"] {
  if (!r) return "none";
  return r.kind;
}

function executionTotalSteps(plan: ExecutionPlan | null, streamSteps: unknown[] | null | undefined): number {
  const nPlan = plan?.steps?.length ?? 0;
  const nStream = Array.isArray(streamSteps) ? streamSteps.length : 0;
  return Math.max(nPlan, nStream);
}

/** D-7-4P：轻量规则，无模型、无远程 */
export function inferExecutionSuccessQuality(
  r: TaskResult,
  totalSteps: number,
  hadDegradedOrWarn: boolean
): MemorySuccessQuality {
  if (hadDegradedOrWarn) return "low";

  if (r.kind === "content") {
    const body = (r.body ?? "").trim();
    const title = (r.title ?? "").trim();
    const summary = (r.summary ?? "").trim();
    if (body.length === 0 && title.length === 0 && summary.length === 0) return "low";
    if (body.length > 0 && body.length < 8 && title.length < 4) return "low";
    if (body.length === 0 && title.length > 0 && title.length < 6) return "low";
    if (totalSteps <= 1 || body.length < 40) return "medium";
    return "high";
  }

  const text = (r.body ?? r.summary ?? "").trim();
  const sc = r.stepCount ?? 0;
  const ec = r.eventCount ?? 0;
  if (text.length === 0 && sc === 0 && ec === 0) return "low";
  if (text.length > 0 && text.length < 12 && sc <= 1) return "low";
  if (totalSteps <= 1 || text.length < 35) return "medium";
  return "high";
}

function isBudgetFailureMessage(msg: string): boolean {
  return (
    /执行步数已达上限|执行超时|max_steps|max_duration|execution_budget_exceeded/i.test(msg) ||
    /已达上限（\d+|ms），已停止/i.test(msg)
  );
}

/** 与 D-7-4P low 判定对齐的「空/极短」结果（用于失败链路的 empty_result） */
function isEmptyOrTinyFailureResult(r: TaskResult): boolean {
  if (r.kind === "content") {
    const body = (r.body ?? "").trim();
    const title = (r.title ?? "").trim();
    const summary = (r.summary ?? "").trim();
    if (body.length === 0 && title.length === 0 && summary.length === 0) return true;
    if (body.length > 0 && body.length < 8 && title.length < 4) return true;
    if (body.length === 0 && title.length > 0 && title.length < 6) return true;
    return false;
  }
  const text = (r.body ?? r.summary ?? "").trim();
  const sc = r.stepCount ?? 0;
  const ec = r.eventCount ?? 0;
  if (text.length === 0 && sc === 0 && ec === 0) return true;
  if (text.length > 0 && text.length < 12 && sc <= 1) return true;
  return false;
}

function inferFailureType(
  ctx: RecordTaskExecutionFailureContext | undefined,
  msg: string,
  effectiveResult: TaskResult | null
): MemoryFailureType {
  if (ctx?.safetyDecision === "block") return "safety";
  if (ctx?.permissionDecision === "block") return "permission";
  if (ctx?.budgetExceeded || isBudgetFailureMessage(msg)) return "budget";
  if (ctx?.emergencyStop) return "runtime";
  if (ctx?.userInitiatedStop) return "runtime";
  if (effectiveResult && isEmptyOrTinyFailureResult(effectiveResult)) return "empty_result";
  return "unknown";
}

function buildFailureSignal(
  input: RecordTaskExecutionInput,
  effectiveResult: TaskResult | null,
  ts: string,
  patternKey: string
): MemoryFailureSignal | undefined {
  if (input.success) return undefined;
  const raw = (input.failureContext?.lastErrorMessage ?? "").trim();
  const failureType = inferFailureType(input.failureContext, raw, effectiveResult);
  const failureReason = raw.length > 500 ? `${raw.slice(0, 497)}…` : raw || undefined;
  return {
    source: "execution_failure",
    createdAt: ts,
    patternKey,
    failureType,
    failureReason
  };
}

function upsertCapabilityStats(
  snap: MemorySnapshot,
  capabilityIds: string[],
  success: boolean,
  ts: string
): void {
  for (const id of capabilityIds) {
    const row = snap.capabilityStats.find((c) => c.capabilityId === id);
    if (row) {
      row.usedCount += 1;
      if (success) row.successCount += 1;
      row.lastUsedAt = ts;
    } else {
      snap.capabilityStats.push({
        capabilityId: id,
        usedCount: 1,
        successCount: success ? 1 : 0,
        lastUsedAt: ts
      });
    }
  }
}

function upsertTaskPattern(
  snap: MemorySnapshot,
  key: string,
  prompt: string,
  analysis: TaskAnalysisResult,
  capabilityIds: string[],
  success: boolean,
  ts: string
): void {
  const shortPrompt = prompt.trim().slice(0, 120);
  let row = snap.taskPatterns.find((p) => p.patternKey === key);
  if (!row) {
    row = {
      patternKey: key,
      promptExamples: shortPrompt ? [shortPrompt] : [],
      preferredMode: analysis.resolvedMode,
      preferredCapabilityIds: [...capabilityIds],
      successCount: success ? 1 : 0,
      lastUsedAt: ts
    };
    snap.taskPatterns.push(row);
    return;
  }

  row.lastUsedAt = ts;
  row.preferredMode = analysis.resolvedMode;
  if (success) {
    row.successCount += 1;
    for (const id of capabilityIds) {
      if (!row.preferredCapabilityIds.includes(id)) row.preferredCapabilityIds.push(id);
    }
  }
  if (shortPrompt && !row.promptExamples.includes(shortPrompt)) {
    row.promptExamples.push(shortPrompt);
    if (row.promptExamples.length > 8) row.promptExamples.shift();
  }
}

/**
 * 追加行为日志、更新能力统计与任务模式（D-6-3 本地持久化 + D-7-3Q contentHash）。
 */
export async function recordTaskExecution(input: RecordTaskExecutionInput): Promise<void> {
  const snap = loadMemorySnapshot();
  const ts = new Date().toISOString();
  const effectiveResult = input.currentResult ?? toTaskResult(input.streamResult ?? null);
  const capabilityIds = mergeCapabilityIds(input.executionPlan, input.streamSteps ?? null);
  const planId = input.executionPlan?.planId ?? null;
  const stepIds = deriveStepIds(input.executionPlan);
  const totalSteps = executionTotalSteps(input.executionPlan, input.streamSteps ?? null);
  const hadDegradedOrWarn = Boolean(input.executionQualityContext?.hadDegradedOrWarn);

  const contentHash = await hashMemoryRecordContentAsync({
    prompt: input.prompt.trim(),
    requestedMode: input.analysis.requestedMode,
    resolvedMode: input.analysis.resolvedMode,
    intent: input.analysis.intent,
    resultKind: effectiveResult?.kind,
    capabilityIds,
    success: input.success
  });

  const pKey = patternKeyFromAnalysis(input.analysis);
  const behavior: UserBehaviorMemory = {
    id: newId(),
    timestamp: ts,
    prompt: input.prompt.trim(),
    requestedMode: input.requestedMode,
    resolvedMode: input.resolvedMode,
    intent: input.analysis.intent,
    planId,
    stepIds,
    capabilityIds,
    resultKind: resultKindFromResult(effectiveResult),
    success: input.success,
    contentHash,
    ...(input.success && effectiveResult
      ? {
          executionSuccessSignal: {
            source: "execution_success" as const,
            createdAt: ts,
            patternKey: pKey,
            successQuality: inferExecutionSuccessQuality(effectiveResult, totalSteps, hadDegradedOrWarn)
          }
        }
      : {}),
    ...(!input.success ? { failureSignal: buildFailureSignal(input, effectiveResult, ts, pKey) } : {})
  };
  snap.behaviorLog.push(behavior);

  if (capabilityIds.length) {
    upsertCapabilityStats(snap, capabilityIds, input.success, ts);
  }

  upsertTaskPattern(snap, pKey, input.prompt, input.analysis, capabilityIds, input.success, ts);

  saveMemorySnapshot(snap);
}
