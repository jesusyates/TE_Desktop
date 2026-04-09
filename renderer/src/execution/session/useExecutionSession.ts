import axios from "axios";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { StartTaskPayload, TaskAttachmentMeta } from "../../types/task";
import type { RouterDecision } from "../../modules/router/routerTypes";
import type { ResolvedTaskMode, TaskMode } from "../../types/taskMode";
import type { ComputerExecutionEvent } from "../../types/computerExecution";
import { analyzeTask } from "../../modules/workbench/analyzer/taskAnalyzer";
import type { TaskAnalysisResult } from "../../modules/workbench/analyzer/taskAnalyzerTypes";
import { planTask } from "../../modules/workbench/planner/taskPlanner";
import type { TaskPlan } from "../../modules/workbench/planner/taskPlanTypes";
import type { ExecutionPlan } from "../../modules/workbench/execution/executionPlanTypes";
import { isLocalExecutionStepType } from "../../modules/workbench/execution/executionPlanTypes";
import { isLocalRuntimeIntent } from "../../modules/workbench/execution/localRuntimeIntent";
import {
  executionPlanToTaskPlanMirror,
  liftTaskPlanToExecutionPlan
} from "../../modules/workbench/execution/executionPlanAdapters";
import {
  prependSafetyHumanConfirmExecutionPlan,
  runSafetyCheck,
  safetyBlockUserFacingMessage
} from "../../modules/safety/safetyChecker";
import { stripContentCapabilityForNormalContent } from "../../modules/workbench/execution/contentCapabilityRecognition";
import type { SafetyCheckResult } from "../../modules/safety/safetyTypes";
import { readPermissionGrantKeysFromStep } from "../../modules/permissions/permissionChecker";
import type { PermissionCheckResult, PermissionKey } from "../../modules/permissions/permissionTypes";
import { loadAppPreferences } from "../../modules/preferences/appPreferences";
import { recordTaskExecution } from "../../modules/memory/memoryRecorder";
import { getMemoryHintsForTaskWithPrefs } from "../../modules/preferences/memoryHintsFromPrefs";
import { getTemplateMemoryContext } from "../../services/templateService";
import { loadMemorySnapshot } from "../../modules/memory/memoryStore";
import { executeContentAction } from "../../modules/content/contentExecutor";
import { toTaskResult } from "../../modules/result/resultAdapters";
import type { TaskResult } from "../../modules/result/resultTypes";
import {
  capabilityStepTaskResultSource,
  localRuntimeStepTaskResultSource,
  resolveContentStepOutputSource
} from "../../modules/result/resultSourcePolicy";
import { postResultToCore } from "../../services/api";
import { flushCanonicalMemoryAfterTaskSuccess } from "../../modules/memory/memoryWriteService";
import { evaluateAuthEscalation, type AuthEscalationKind } from "../../services/authEscalation";
import { persistExecutionCachesTerminal } from "../../services/executionDetailLocalCache";
import { inferRiskControlFields } from "../../services/riskTierPolicy";
import { scheduleCoreAuditEvent } from "../../services/coreAuditService";
import type { ExecutionBudget } from "../../services/systemPolicyService";
import { getSystemPolicy } from "../../services/systemPolicyService";
import { createTask, fetchTaskSnapshot } from "../../services/tasks.api";
import {
  extractArticleThemeFromPrompt,
  isSeoLiteArticleExecutionPrompt,
  normalizeArticleResult
} from "../../modules/workbench/workbenchSeoLiteClose";
import { extractLightMemory } from "../../modules/memory/lightMemoryEvolution";
import { generateNextTaskSuggestions } from "../../modules/workbench/nextTaskSuggestions";
import {
  bumpActiveGoalOnContentTaskSuccess,
  getNextGoalSuggestionPrefix
} from "../../modules/workbench/activeGoalStore";
import { isLocalRuntimeSummaryOnlyForPersistence } from "../../modules/result/taskResultLocalRetention";
import {
  appendExecutionHistory,
  type ExecutionHistoryMode,
  type ExecutionHistoryStatus
} from "../../services/history.api";
import { useAuthStore } from "../../store/authStore";
import { useExecutionEventStream, type ExecutionEventStreamSnapshot } from "./useExecutionEventStream";
import {
  ExecutionAction,
  ExecutionPhase,
  ExecutionStatus,
  getAllowedActions,
  isExecutionActionAllowed,
  isExecutionInProgress,
  statusToActivePhase
} from "./execution";
import { mapBackendStatusToExecutionStatus } from "./taskExecutionMap";
import {
  aggregateExecutionStepResults,
  mapExecutionPlanStepStatus,
  orderedStepResultsForExecutionPlan,
  taskResultFromCapabilityStep,
  taskResultFromLocalRuntimeStep,
  toContentTaskStepForExecutor
} from "./executionPlanRunHelpers";
import { runCapabilityStep } from "../../modules/workbench/execution/runCapabilityStep";
import { runLocalExecutionPlanStep } from "../../services/localRuntimeBridge";

/**
 * D-7-4Z — Authoritative execution source（权威执行真相源）
 * ---------------------------------------------------------------------------
 * 执行状态、步骤、终端结果以本 hook 返回的会话对象为准。Shared Core（apiClient）与 AI 网关（`services/api`）
 * 仅用于账户/配额、旁路归档、审计与 optional 分析增强；**禁止**用其 HTTP 响应直接或单独驱动 `mockStatus` /
 * `currentResult` 的语义（可写入辅助字段、日志、异步同步，但会话门闩在本地）。
 */

/**
 * Mock / 本地流水线内部状态（paused 用 userPaused 表达，不写入 mockStatus）。
 */
type SessionSnapshot = {
  mockStatus: ExecutionStatus;
  userPaused: boolean;
  lastPrompt: string;
  lastErrorMessage: string;
  currentTaskId: string;
  /** D-5-1：最近一次启动的请求模式 / 解析结果 */
  lastRequestedMode?: TaskMode;
  lastResolvedMode?: ResolvedTaskMode;
  /** D-5-4：最近一次 start 的附件 */
  lastAttachments: TaskAttachmentMeta[];
  /** D-5-5：最近一次 analyzeTask 结果（running 阶段选能力） */
  lastTaskAnalysis: TaskAnalysisResult | null;
  /** D-5-3B：非 null 时 ComputerExecutionPanel 使用真实事件；null 走 mock */
  computerExecutionEvents: ComputerExecutionEvent[] | null;
  /** F-1：唯一执行计划（多步流水线） */
  executionPlan: ExecutionPlan | null;
  currentStepIndex: number;
  /** D-5-9：系统统一 TaskResult（唯一写入目标） */
  currentResult: TaskResult | null;
  /** F-1：各步 stepId → TaskResult */
  stepResults: Record<string, TaskResult>;
  /** D-6-1：最近一次安全检查（clear / stop / initFromTask 时清空） */
  lastSafetyResult: SafetyCheckResult | null;
  /** D-6-2：用户本次会话中通过「权限确认」步追加的授权 */
  permissionSessionGrants: PermissionKey[];
  /** D-6-2：最近一次权限检查（平台 deny 等） */
  lastPermissionResult: PermissionCheckResult | null;
  /** D-7-3H：本次成功归档到 Core 的 runId（供结果区拉取 Core 覆盖） */
  lastCoreResultRunId: string;
  /** D-7-4F：guest / 未验证被 authRequirement 拦下时，驱动结果区登录或占位引导 */
  lastAuthEscalation: AuthEscalationKind | null;
  /** AI Router v1：最近一轮 session.start 关联的调度决策（createTask 占位） */
  lastRouterDecision: RouterDecision | null;
};

const MOCK_RUN_MS = 2400;
const MOCK_VALIDATE_MS = 400;
const MOCK_QUEUE_EXTRA_MS = 450;
const MOCK_STOP_MS = 320;

function schedule(ref: MutableTimerRef, fn: () => void, ms: number) {
  const id = window.setTimeout(fn, ms);
  ref.ids.push(id);
}

function clearScheduled(ref: MutableTimerRef) {
  ref.ids.forEach((id) => window.clearTimeout(id));
  ref.ids = [];
}

type MutableTimerRef = { ids: number[] };

/** 附件元数据 → createTask.importedMaterials 预留 JSON 行（无上传） */
export function attachmentsToImportedMaterials(attachments: TaskAttachmentMeta[] | undefined): string[] {
  if (!attachments?.length) return [];
  return attachments.map((a) =>
    JSON.stringify({
      id: a.id,
      name: a.name,
      size: a.size,
      mimeType: a.mimeType
    })
  );
}

function axiosDetail(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const d = e.response?.data;
    if (d && typeof d === "object" && "message" in d) return String((d as { message: unknown }).message);
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

function taskResultForCoreSync(r: TaskResult): TaskResult {
  if (!isLocalRuntimeSummaryOnlyForPersistence(r)) return r;
  if (r.kind !== "content") return r;
  return {
    ...r,
    body: (r.summary || r.title || "").trim()
  };
}

function stepResultsForCoreSync(steps: Record<string, TaskResult>): Record<string, TaskResult> {
  const out: Record<string, TaskResult> = {};
  for (const [k, v] of Object.entries(steps)) {
    out[k] = taskResultForCoreSync(v);
  }
  return out;
}

/** D-7-3G：任务成功时归档 Result（失败仅打日志）；本地执行不落全文 */
function dualWriteCoreResult(
  s: Pick<SessionSnapshot, "lastPrompt" | "currentResult" | "stepResults">,
  runId: number
): void {
  const result = s.currentResult;
  const steps = s.stepResults;
  if (!result && !Object.keys(steps).length) return;
  const firstKey = Object.keys(steps)[0];
  const primary = result ?? (firstKey != null ? steps[firstKey] : undefined);
  if (!primary) return;
  void postResultToCore({
    runId: `run-${runId}`,
    prompt: s.lastPrompt.trim(),
    result: taskResultForCoreSync(primary),
    stepResults: stepResultsForCoreSync(steps)
  })
    .then(() => console.log("[D-7-3G] Core Result synced"))
    .catch((e) => console.error("[D-7-3G] Core /result failed", e));
}

function deriveExecutionStatus(
  snap: SessionSnapshot,
  rawStatus: string
): ExecutionStatus {
  const { mockStatus, userPaused, currentTaskId } = snap;

  if (mockStatus === "stopping" || mockStatus === "stopped") {
    return mockStatus;
  }
  if (userPaused) {
    return "paused";
  }
  if (mockStatus === "validating" || mockStatus === "queued") {
    return mockStatus;
  }
  if (currentTaskId && rawStatus.trim()) {
    return mapBackendStatusToExecutionStatus(rawStatus);
  }
  return mockStatus;
}

/** D-1：写入正式 History 的 preview 摘要（不落技术栈）。 */
function buildWorkbenchHistoryPreview(
  s: SessionSnapshot,
  es: ExecutionEventStreamSnapshot,
  st: ExecutionStatus
): string {
  const max = 200;
  if (st === "error") {
    const msg = (
      (s.lastSafetyResult?.decision === "block" ? s.lastErrorMessage : "") ||
      (s.lastPermissionResult?.decision === "block" ? s.lastErrorMessage : "") ||
      es.error ||
      s.lastErrorMessage ||
      ""
    ).trim();
    return msg.slice(0, max);
  }
  const r = s.currentResult;
  if (r?.kind === "content") {
    const t = (r.title || "").trim();
    if (isLocalRuntimeSummaryOnlyForPersistence(r)) {
      const sum = (r.summary || "").trim();
      const comb = t && sum ? `${t} · ${sum}` : t || sum;
      return comb.slice(0, max);
    }
    const b = (r.body || "").trim();
    const comb = t && b ? `${t}\n${b}` : t || b;
    return comb.slice(0, max);
  }
  if (r) {
    const blob = String(r.summary || r.body || "").trim();
    if (blob) return blob.slice(0, max);
  }
  if (es.result != null && typeof es.result === "string") return es.result.slice(0, max);
  return "";
}

export type InitTaskMeta = {
  prompt: string;
  backendStatus: string;
};

export type UseExecutionSessionReturn = {
  status: ExecutionStatus;
  phase: ExecutionPhase | null;
  lastPrompt: string;
  lastErrorMessage: string;
  lastAuthEscalation: AuthEscalationKind | null;
  currentTaskId: string;
  /** D-5-1 */
  requestedMode: TaskMode;
  resolvedMode: ResolvedTaskMode;
  /** D-2-4D：只读事件流快照（logs/steps/result），供结果区适配展示 */
  eventStream: ExecutionEventStreamSnapshot;
  allowedActions: ExecutionAction[];
  /** 兼容 string 与 { prompt, attachments }（D-3-1） */
  start: (input: string | StartTaskPayload) => void;
  /** D-2-5：按 taskId 恢复会话并订阅事件流（不 createTask） */
  initFromTask: (taskId: string, meta?: InitTaskMeta) => void | Promise<void>;
  dispatch: (action: ExecutionAction) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** D-7-3X：不依赖 Core，立即终止推进 */
  emergencyStop: () => void;
  retry: () => void;
  clear: () => void;
  isBusy: boolean;
  /** D-5-3B：文件整理等 Computer 能力回传的 ComputerExecutionEvent 序列 */
  computerExecutionEvents: ComputerExecutionEvent[] | null;
  /** F-1：Execution Pipeline 计划（只读） */
  executionPlan: ExecutionPlan | null;
  currentStepIndex: number;
  /** D-5-7 / F-1A：人工确认步通过后继续执行 */
  confirmCurrentStep: () => void;
  /** F-1A：拒绝确认，终止执行链（后续步骤不执行） */
  rejectCurrentStep: () => void;
  /** D-5-9：TaskResult | null */
  currentResult: TaskResult | null;
  /** D-5-10：plan 各步产出 */
  stepResults: Record<string, TaskResult>;
  /** D-6-1 */
  lastSafetyResult: SafetyCheckResult | null;
  /** D-6-2 */
  lastPermissionResult: PermissionCheckResult | null;
  /** D-7-3H */
  lastCoreResultRunId: string;
  /** D-7-3Z：安全/权限 warn 非阻断文案（供 Workbench 轻提示） */
  executionSoftWarnings: string[];
  /** F-2B：最近一次任务的规则分析结果（供能力模式横幅等） */
  lastTaskAnalysis: TaskAnalysisResult | null;
  /** F-2B：当前任务被判为能力链时，改为普通内容流水线重新执行 */
  rerunAsNormalContent: () => void;
  /** AI Router v1：执行模型 / 位置（来自 Core，随会话） */
  lastRouterDecision: RouterDecision | null;
};

const initialSnap = (): SessionSnapshot => ({
  mockStatus: "idle",
  userPaused: false,
  lastPrompt: "",
  lastErrorMessage: "",
  currentTaskId: "",
  lastAttachments: [],
  lastTaskAnalysis: null,
  computerExecutionEvents: null,
  executionPlan: null,
  currentStepIndex: 0,
  currentResult: null,
  stepResults: {},
  lastSafetyResult: null,
  permissionSessionGrants: [],
  lastPermissionResult: null,
  lastCoreResultRunId: "",
  lastAuthEscalation: null,
  lastRouterDecision: null
});

/**
 * D-2-4C：validating / queued / fallback 仍由 mock；createTask 后有 taskId 时由事件流 rawStatus 映射接管（本地 pause/stop 优先）。
 */
/** @see 文件顶部 D-7-4Z 权威会话说明 */
export function useExecutionSession(): UseExecutionSessionReturn {
  const [snap, setSnap] = useState<SessionSnapshot>(initialSnap);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  const [executionSoftWarnings, setExecutionSoftWarnings] = useState<string[]>([]);
  const executionSoftWarningsRef = useRef<string[]>([]);
  executionSoftWarningsRef.current = executionSoftWarnings;
  const appendExecutionWarning = useCallback((message: string) => {
    const t = message.trim();
    if (!t) return;
    setExecutionSoftWarnings((prev) => {
      if (prev.includes(t)) return prev;
      return [...prev, t].slice(-8);
    });
  }, []);

  const timersRef = useRef<MutableTimerRef>({ ids: [] });
  const generationRef = useRef(0);
  const executionBudgetRef = useRef<ExecutionBudget>({ maxSteps: 20, maxDurationMs: 30000 });
  const sessionRunStartedAtRef = useRef<number | null>(null);
  const streamRawRef = useRef("");
  const derivedStatusRef = useRef<ExecutionStatus>("idle");
  const prevLoggedStatusRef = useRef<ExecutionStatus | null>(null);
  /** D-5-6：防止同一 plan step 重复执行（React StrictMode / 重渲染） */
  const planStepLockRef = useRef<string | null>(null);
  /** D-7-3E：曾用 Core Safety 且为 allow 时，capability 前做一次本地兜底对照 */
  const coreSafetyGateRef = useRef<{ coreResult: SafetyCheckResult } | null>(null);
  /** D-7-3F：本 run 的 Core Permission 结果（按 capabilityId） */
  const permissionOverrideMapRef = useRef<Record<string, PermissionCheckResult> | null>(null);
  /** D-7-3F：Core 判定为 allow 的 capability，用于本地权限兜底对照 */
  const corePermissionAllowByCapRef = useRef<Set<string>>(new Set());
  /** D-6-3：用户发起的单次流水线（initFromTask 不设 true；clear 置 false） */
  const memoryEligibleRef = useRef(false);
  const memoryRunIdCounterRef = useRef(0);
  const memoryActiveRunIdRef = useRef(0);
  const memoryLastRecordedRunIdRef = useRef(-1);
  /** D-7-4Q：紧急停止时供 failureSignal.runtime 推断（新 run 在 armPipeline 清空） */
  const memoryEmergencyStopRef = useRef(false);
  /** D-2：本次 pipeline 的模板 ID（仅用于成功后的模板/平台类 memory 写入） */
  const lastStartedTemplateIdRef = useRef("");

  useEffect(() => () => clearScheduled(timersRef.current), []);

  const eventStreamTaskId = snap.currentTaskId.trim() ? snap.currentTaskId : "";
  const eventStream = useExecutionEventStream(eventStreamTaskId);
  const eventStreamRef = useRef(eventStream);
  useLayoutEffect(() => {
    eventStreamRef.current = eventStream;
  }, [eventStream]);

  const executionCacheFlushTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (executionCacheFlushTimerRef.current != null) {
        window.clearTimeout(executionCacheFlushTimerRef.current);
        executionCacheFlushTimerRef.current = null;
      }
    },
    []
  );

  useLayoutEffect(() => {
    streamRawRef.current = eventStream.rawStatus;
  }, [eventStream.rawStatus]);

  const status = useMemo(
    () => deriveExecutionStatus(snap, eventStream.rawStatus),
    [snap, eventStream.rawStatus]
  );
  /** D-7-5Z1：与 status 同步更新，避免仅靠 useEffect 滞后导致 start() 仍见「进行中」而早退 */
  derivedStatusRef.current = status;

  const mappedStatusForLog = useMemo(
    () =>
      snap.currentTaskId && eventStream.rawStatus.trim()
        ? mapBackendStatusToExecutionStatus(eventStream.rawStatus)
        : null,
    [snap.currentTaskId, eventStream.rawStatus]
  );

  useEffect(() => {
    if (prevLoggedStatusRef.current === status) return;
    prevLoggedStatusRef.current = status;
    console.log("[status-mapping]", {
      rawStatus: eventStream.rawStatus || null,
      mappedStatus: mappedStatusForLog,
      finalStatus: status
    });
  }, [status, eventStream.rawStatus, mappedStatusForLog]);

  const lastErrorMessage = useMemo(() => {
    if (snap.lastSafetyResult?.decision === "block") return snap.lastErrorMessage;
    if (snap.lastPermissionResult?.decision === "block") return snap.lastErrorMessage;
    if (status === "error" && eventStream.error) return eventStream.error;
    return snap.lastErrorMessage;
  }, [
    status,
    eventStream.error,
    snap.lastErrorMessage,
    snap.lastSafetyResult,
    snap.lastPermissionResult
  ]);

  /** D-1：工作台终态写入 Core execution_history（须登录；sessionStorage 防 StrictMode 双次提交）。 */
  useEffect(() => {
    if (!loadAppPreferences().dataSafety.allowServerHistoryWrite) return;
    if (status !== "success" && status !== "error" && status !== "stopped") return;
    if (!useAuthStore.getState().userId.trim()) return;
    const runId = memoryActiveRunIdRef.current;
    if (runId < 1) return;
    try {
      const dedupeKey = `aics.d1hist.run.${runId}`;
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(dedupeKey)) return;
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(dedupeKey, "1");
    } catch {
      /* ignore */
    }
    const s = snapRef.current;
    const es = eventStreamRef.current;
    const promptText = (s.lastPrompt || "").trim();
    if (!promptText) return;
    const histStatus: ExecutionHistoryStatus =
      status === "success" ? "success" : status === "error" ? "error" : "stopped";
    const mode: ExecutionHistoryMode = s.lastResolvedMode === "computer" ? "local" : "ai";
    const preview = buildWorkbenchHistoryPreview(s, es, status);
    const taskId = s.currentTaskId?.trim() || undefined;
    void appendExecutionHistory({ prompt: promptText, preview, status: histStatus, mode, taskId }).catch(() => {});
  }, [status]);

  /** D-6-3：success / error 时写入长期记忆（stopped 在 stop 回调中写，避免清空快照前丢失） */
  useEffect(() => {
    if (!loadAppPreferences().dataSafety.allowTaskMemoryWrite) return;
    if (status !== "success" && status !== "error") return;
    if (!memoryEligibleRef.current) return;
    const analysis = snapRef.current.lastTaskAnalysis;
    if (!analysis) return;
    if (memoryLastRecordedRunIdRef.current === memoryActiveRunIdRef.current) return;
    const s = snapRef.current;
    const runIdNum = memoryActiveRunIdRef.current;
    memoryLastRecordedRunIdRef.current = runIdNum;
    memoryEligibleRef.current = false;
    void (async () => {
      try {
        const es = eventStreamRef.current;
        const failureMsg = (() => {
          if (s.lastSafetyResult?.decision === "block") return (s.lastErrorMessage ?? "").trim();
          if (s.lastPermissionResult?.decision === "block") return (s.lastErrorMessage ?? "").trim();
          if (status === "error" && es.error) return es.error.trim();
          return (s.lastErrorMessage ?? "").trim();
        })();
        await recordTaskExecution({
          prompt: s.lastPrompt,
          requestedMode: s.lastRequestedMode ?? "auto",
          resolvedMode: s.lastResolvedMode ?? "content",
          analysis,
          executionPlan: s.executionPlan,
          stepResults: s.stepResults,
          currentResult: s.currentResult,
          streamSteps: es.steps ?? null,
          streamResult: es.result ?? null,
          success: status === "success",
          executionQualityContext: {
            hadDegradedOrWarn:
              s.lastSafetyResult?.decision === "warn" ||
              s.lastPermissionResult?.decision === "warn" ||
              executionSoftWarningsRef.current.length > 0
          },
          ...(status === "error"
            ? {
                failureContext: {
                  safetyDecision: s.lastSafetyResult?.decision,
                  permissionDecision: s.lastPermissionResult?.decision,
                  lastErrorMessage: failureMsg,
                  emergencyStop: memoryEmergencyStopRef.current,
                  userInitiatedStop: false
                }
              }
            : {})
        });
      } catch (e) {
        console.error("[memory] recordTaskExecution failed", e);
      } finally {
        memoryEmergencyStopRef.current = false;
      }
      if (status === "success" && s.lastTaskAnalysis) {
        const runSourceId = `run-${runIdNum}`;
        void flushCanonicalMemoryAfterTaskSuccess({
          prompt: s.lastPrompt,
          lastRequestedMode: s.lastRequestedMode,
          lastTaskAnalysis: s.lastTaskAnalysis,
          executionPlan: s.executionPlan,
          currentResult: s.currentResult,
          runSourceId,
          templateId: lastStartedTemplateIdRef.current.trim() || undefined
        })
          .then(() => console.log("[D-2] Core Memory canonical flush ok"))
          .catch((e) => console.error("[D-2] Core /memory-record failed", e));
      }
      if (status === "success") {
        dualWriteCoreResult(s, runIdNum);
        setSnap((prev) => ({
          ...prev,
          lastCoreResultRunId: `run-${runIdNum}`
        }));
      }
    })();
  }, [status]);

  /** D-7-3U：success / error 时落盘 unifiedResult 与轮询 logs；微任务 + 2s 再写以对齐事件流 */
  useEffect(() => {
    if (status !== "success" && status !== "error") {
      if (executionCacheFlushTimerRef.current != null) {
        window.clearTimeout(executionCacheFlushTimerRef.current);
        executionCacheFlushTimerRef.current = null;
      }
      return;
    }
    const tid = snapRef.current.currentTaskId?.trim();
    if (!tid) return;
    const gen = generationRef.current;

    const run = () => {
      if (generationRef.current !== gen) return;
      const s = snapRef.current;
      const es = eventStreamRef.current;
      persistExecutionCachesTerminal({
        taskId: tid,
        currentResult: s.currentResult,
        streamResult: es.result,
        logs: es.logs,
        coreRunId: s.lastCoreResultRunId?.trim() || undefined
      });
    };

    queueMicrotask(run);
    if (executionCacheFlushTimerRef.current != null) {
      window.clearTimeout(executionCacheFlushTimerRef.current);
    }
    executionCacheFlushTimerRef.current = window.setTimeout(() => {
      executionCacheFlushTimerRef.current = null;
      run();
    }, 2000);

    return () => {
      if (executionCacheFlushTimerRef.current != null) {
        window.clearTimeout(executionCacheFlushTimerRef.current);
        executionCacheFlushTimerRef.current = null;
      }
    };
  }, [status]);

  /** mock 收尾（resume 路径，无 createTask） */
  const runMockCompletionTimer = useCallback((gen: number) => {
    schedule(timersRef.current, () => {
      if (generationRef.current !== gen) return;
      const fail = Math.random() < 0.12;
      setSnap((s) => ({
        ...s,
        mockStatus: fail ? "error" : "success",
        lastErrorMessage: fail ? "mock_failure" : "",
        lastAuthEscalation: null
      }));
    }, MOCK_RUN_MS);
  }, []);

  const runCreateTaskCompletion = useCallback(
    (
      gen: number,
      prompt: string,
      importedMaterials: string[],
      templateId: string | undefined,
      requestedMode: TaskMode,
      resolvedMode: ResolvedTaskMode,
      routerDecision: RouterDecision | null | undefined,
      lightMemoryHits?: string[] | null,
      submitUserLine?: string | null
    ) => {
    schedule(timersRef.current, () => {
      if (generationRef.current !== gen) return;
      void createTask({
        oneLinePrompt: prompt,
        importedMaterials,
        ...(templateId ? { templateId } : {}),
        requestedMode,
        resolvedMode,
        ...(routerDecision ? { routerDecision } : {})
      })
        .then((res) => {
          if (generationRef.current !== gen) return;
          const apiResult = toTaskResult(res.result ?? null);
          const isArticlePack = isSeoLiteArticleExecutionPrompt(prompt);
          const mergedBase: TaskResult | null = apiResult
            ? {
                ...apiResult,
                metadata: {
                  ...(apiResult.metadata ?? {}),
                  _source: "shared_core_create_task",
                  ...(apiResult.kind === "content"
                    ? {
                        taskType: "content",
                        ...(isArticlePack
                          ? { qualityHint: "seo_lite_v1", structure: "article_basic" }
                          : {}),
                        ...(lightMemoryHits && lightMemoryHits.length > 0
                          ? {
                              memoryInfluence: true,
                              memoryHits: lightMemoryHits.slice(0, 2)
                            }
                          : {})
                      }
                    : {})
                }
              }
            : null;

          let merged: TaskResult | null = mergedBase;
          if (merged?.kind === "content" && isArticlePack) {
            const theme = extractArticleThemeFromPrompt(prompt);
            const raw =
              (merged.body && merged.body.trim()) ||
              (merged.title && merged.title.trim()) ||
              "";
            const normalized = normalizeArticleResult(raw, theme);
            const lines = normalized.split(/\n/);
            let li = 0;
            while (li < lines.length && !lines[li].trim()) li++;
            const titleLine =
              (lines[li] ?? "").trim() || (merged.title && merged.title.trim()) || "—";
            const bodyText = lines
              .slice(li + 1)
              .join("\n")
              .replace(/^\n+/, "")
              .trim();
            merged = {
              ...merged,
              title: titleLine,
              body: bodyText
            };
          }

          const contentTaskType =
            merged?.kind === "content"
              ? (merged.metadata as { taskType?: unknown } | undefined)?.taskType
              : null;
          if (merged?.kind === "content" && contentTaskType === "content") {
            const { celebration, goalAssetizationNote } = bumpActiveGoalOnContentTaskSuccess();
            if (celebration) {
              merged = {
                ...merged,
                metadata: {
                  ...(merged.metadata ?? {}),
                  goalCompletedMessage: celebration,
                  ...(goalAssetizationNote ? { goalAssetizationNote } : {})
                }
              };
            }
          }

          if (merged?.kind === "content") {
            const chainPrefix = getNextGoalSuggestionPrefix();
            const sug = generateNextTaskSuggestions(
              merged,
              (submitUserLine ?? "").trim(),
              lightMemoryHits,
              chainPrefix
            );
            if (sug.length > 0) {
              merged = {
                ...merged,
                metadata: { ...(merged.metadata ?? {}), nextSuggestions: sug }
              };
            }
          }

          if (merged) extractLightMemory(merged);

          setSnap((s) => ({
            ...s,
            currentTaskId: res.id,
            ...(merged ? { currentResult: merged } : {})
          }));
          schedule(timersRef.current, () => {
            if (generationRef.current !== gen) return;
            if (streamRawRef.current.trim()) return;
            setSnap((s) => {
              if (generationRef.current !== gen) return s;
              if (s.mockStatus !== "running") return s;
              return {
                ...s,
                mockStatus: "success",
                lastErrorMessage: "",
                lastAuthEscalation: null
              };
            });
          }, MOCK_RUN_MS);
        })
        .catch((e) => {
          if (generationRef.current !== gen) return;
          setSnap((s) => ({
            ...s,
            mockStatus: "error",
            lastErrorMessage: axiosDetail(e),
            currentTaskId: "",
            lastAuthEscalation: null
          }));
        });
    }, MOCK_RUN_MS);
  },
  []);

  const armPipeline = useCallback(
    async (
      prompt: string,
      importedMaterials: string[],
      templateId: string | undefined,
      analysis: TaskAnalysisResult,
      attachmentsMeta: TaskAttachmentMeta[] | undefined,
      planOverride?: TaskPlan,
      safetyOverride?: SafetyCheckResult,
      permissionOverrideMap?: Record<string, PermissionCheckResult>,
      routerDecision?: RouterDecision | null,
      lightMemoryHits?: string[] | null,
      submitUserLine?: string | null
    ) => {
      const rd = routerDecision ?? null;
      setExecutionSoftWarnings([]);
      const policy = await getSystemPolicy();
      executionBudgetRef.current = { ...policy.defaultExecutionBudget };
      sessionRunStartedAtRef.current = null;

      generationRef.current += 1;
      const gen = generationRef.current;
      memoryRunIdCounterRef.current += 1;
      memoryActiveRunIdRef.current = memoryRunIdCounterRef.current;
      memoryEligibleRef.current = true;
      memoryEmergencyStopRef.current = false;
      lastStartedTemplateIdRef.current = templateId?.trim() ?? "";
      clearScheduled(timersRef.current);
      permissionOverrideMapRef.current = permissionOverrideMap ? { ...permissionOverrideMap } : null;
      corePermissionAllowByCapRef.current = new Set();
      if (permissionOverrideMap) {
        for (const [capKey, v] of Object.entries(permissionOverrideMap)) {
          if (v.decision === "allow" || v.decision === "warn") corePermissionAllowByCapRef.current.add(capKey);
        }
      }
      const attach = attachmentsMeta ?? [];
      const tExeMode = analysis.metadata?.templateExecutionContext?.requestedMode;
      const memoryHints = getMemoryHintsForTaskWithPrefs(
        loadMemorySnapshot(),
        analysis,
        getTemplateMemoryContext(templateId, {
          workflowTypeHint:
            tExeMode === "content" || tExeMode === "computer" ? tExeMode : undefined
        })
      );
      const taskIdSeed = `task-${memoryActiveRunIdRef.current}`;
      const executionPlan =
        !planOverride || isLocalRuntimeIntent(analysis.intent)
          ? planTask(analysis, { memoryHints, taskId: taskIdSeed })
          : liftTaskPlanToExecutionPlan(planOverride, taskIdSeed);
      const safety =
        safetyOverride ??
        runSafetyCheck({ prompt, plan: executionPlanToTaskPlanMirror(executionPlan) });
      coreSafetyGateRef.current =
        safetyOverride != null ? { coreResult: safetyOverride } : null;
      if (safety.decision === "block") {
        const msg = safetyBlockUserFacingMessage(safety);
        setSnap({
          mockStatus: "error",
          userPaused: false,
          lastPrompt: prompt,
          lastErrorMessage: msg,
          currentTaskId: "",
          lastRequestedMode: analysis.requestedMode,
          lastResolvedMode: analysis.resolvedMode,
          lastAttachments: attach,
          lastTaskAnalysis: analysis,
          computerExecutionEvents: null,
          executionPlan: null,
          currentStepIndex: 0,
          currentResult: null,
          stepResults: {},
          lastSafetyResult: safety,
          permissionSessionGrants: [],
          lastPermissionResult: null,
          lastCoreResultRunId: "",
          lastAuthEscalation: null,
          lastRouterDecision: null
        });
        scheduleCoreAuditEvent({
          runId: `run-${memoryActiveRunIdRef.current}`,
          eventType: "safety_block",
          decision: safety.decision,
          level: safety.level ?? undefined,
          reason: msg
        });
        return;
      }

      const hasToken = Boolean(useAuthStore.getState().accessToken?.trim());
      const safetyEscalation = evaluateAuthEscalation(safety.authRequirement, hasToken);
      if (safetyEscalation.shouldAbort) {
        setSnap({
          mockStatus: "error",
          userPaused: false,
          lastPrompt: prompt,
          lastErrorMessage: safetyEscalation.userMessage ?? "受限",
          currentTaskId: "",
          lastRequestedMode: analysis.requestedMode,
          lastResolvedMode: analysis.resolvedMode,
          lastAttachments: attach,
          lastTaskAnalysis: analysis,
          computerExecutionEvents: null,
          executionPlan: null,
          currentStepIndex: 0,
          currentResult: null,
          stepResults: {},
          lastSafetyResult: safety,
          permissionSessionGrants: [],
          lastPermissionResult: null,
          lastCoreResultRunId: "",
          lastAuthEscalation: safetyEscalation.escalation ?? null,
          lastRouterDecision: null
        });
        scheduleCoreAuditEvent({
          runId: `run-${memoryActiveRunIdRef.current}`,
          eventType: "auth_escalation_required",
          decision: String(safety.authRequirement ?? ""),
          level: safety.level ?? undefined,
          reason: safetyEscalation.userMessage ?? "受限"
        });
        return;
      }

      if (safety.decision === "warn") {
        const warnText =
          safety.reason?.trim() ||
          safety.issues.map((i) => i.message).join(" ") ||
          "安全检查提示：存在需注意项，流程仍继续。";
        appendExecutionWarning(`安全提示：${warnText}`);
        if (import.meta.env.DEV) {
          console.warn("[D-7-3V safety warn]", warnText);
        }
      }

      const finalExecutionPlan =
        safety.decision === "confirm"
          ? prependSafetyHumanConfirmExecutionPlan(executionPlan, safety)
          : executionPlan;
      const hasCapabilityStep = false;

      if (!policy.automationEnabled && hasCapabilityStep) {
        setSnap({
          mockStatus: "error",
          userPaused: false,
          lastPrompt: prompt,
          lastErrorMessage: "自动化执行已被系统关闭，无法运行包含自动化能力步骤的任务。",
          currentTaskId: "",
          lastRequestedMode: analysis.requestedMode,
          lastResolvedMode: analysis.resolvedMode,
          lastAttachments: attach,
          lastTaskAnalysis: analysis,
          computerExecutionEvents: null,
          executionPlan: null,
          currentStepIndex: 0,
          currentResult: null,
          stepResults: {},
          lastSafetyResult: safety,
          permissionSessionGrants: [],
          lastPermissionResult: null,
          lastCoreResultRunId: "",
          lastAuthEscalation: null,
          lastRouterDecision: null
        });
        scheduleCoreAuditEvent({
          runId: `run-${memoryActiveRunIdRef.current}`,
          eventType: "automation_disabled",
          reason: "自动化执行已被系统关闭，无法运行包含自动化能力步骤的任务。"
        });
        return;
      }

      const riskLevel = safety.level ?? "low";
      if (
        !policy.highRiskEnabled &&
        (riskLevel === "high" || riskLevel === "critical") &&
        hasCapabilityStep
      ) {
        setSnap({
          mockStatus: "error",
          userPaused: false,
          lastPrompt: prompt,
          lastErrorMessage:
            "当前系统未启用高风险自动化；无法执行含自动化能力且风险等级为高/临界的任务。（纯内容任务不受影响）",
          currentTaskId: "",
          lastRequestedMode: analysis.requestedMode,
          lastResolvedMode: analysis.resolvedMode,
          lastAttachments: attach,
          lastTaskAnalysis: analysis,
          computerExecutionEvents: null,
          executionPlan: null,
          currentStepIndex: 0,
          currentResult: null,
          stepResults: {},
          lastSafetyResult: safety,
          permissionSessionGrants: [],
          lastPermissionResult: null,
          lastCoreResultRunId: "",
          lastAuthEscalation: null,
          lastRouterDecision: null
        });
        scheduleCoreAuditEvent({
          runId: `run-${memoryActiveRunIdRef.current}`,
          eventType: "high_risk_disabled",
          level: riskLevel,
          reason:
            "当前系统未启用高风险自动化；无法执行含自动化能力且风险等级为高/临界的任务。（纯内容任务不受影响）"
        });
        return;
      }

      setSnap({
        mockStatus: "validating",
        userPaused: false,
        lastPrompt: prompt,
        lastErrorMessage: "",
        currentTaskId: "",
        lastRequestedMode: analysis.requestedMode,
        lastResolvedMode: analysis.resolvedMode,
        lastAttachments: attach,
        lastTaskAnalysis: analysis,
        computerExecutionEvents: null,
        executionPlan: { ...finalExecutionPlan, status: "running" },
        currentStepIndex: 0,
        currentResult: null,
        stepResults: {},
        lastSafetyResult: safety,
        permissionSessionGrants: [],
        lastPermissionResult: null,
        lastCoreResultRunId: "",
        lastAuthEscalation: null,
        lastRouterDecision: rd
      });

      schedule(timersRef.current, () => {
        if (generationRef.current !== gen) return;
        setSnap((s) => ({ ...s, mockStatus: "queued" }));
      }, MOCK_VALIDATE_MS);

      schedule(timersRef.current, () => {
        if (generationRef.current !== gen) return;
        setSnap((s) => ({ ...s, mockStatus: "running" }));
        runCreateTaskCompletion(
          gen,
          prompt,
          importedMaterials,
          templateId,
          analysis.requestedMode,
          analysis.resolvedMode,
          rd,
          lightMemoryHits?.length ? lightMemoryHits : null,
          submitUserLine?.trim() ? submitUserLine : null
        );
      }, MOCK_VALIDATE_MS + MOCK_QUEUE_EXTRA_MS);
    },
    [runCreateTaskCompletion, appendExecutionWarning]
  );

  const rerunAsNormalContent = useCallback(() => {
    const s = snapRef.current;
    if (s.lastTaskAnalysis?.intent !== "content_capability" || !s.lastPrompt.trim()) return;
    const patched = stripContentCapabilityForNormalContent(s.lastTaskAnalysis);
    const materials = attachmentsToImportedMaterials(s.lastAttachments);
    void armPipeline(
      s.lastPrompt.trim(),
      materials,
      lastStartedTemplateIdRef.current.trim() || undefined,
      patched,
      s.lastAttachments,
      undefined,
      undefined,
      undefined,
      s.lastRouterDecision,
      null,
      null
    );
  }, [armPipeline]);

  const start = useCallback(
    (input: string | StartTaskPayload) => {
      const payload: StartTaskPayload = typeof input === "string" ? { prompt: input } : input;
      const p = payload.prompt.trim();
      if (!p) return;
      /** D-7-5Q：success/error/stopped 后可独立发起新任务；仅进行态阻塞 */
      if (isExecutionInProgress(derivedStatusRef.current)) return;
      const materials = attachmentsToImportedMaterials(payload.attachments);
      const tid = payload.templateId?.trim();
      const override = payload.analysisOverride;
      const stylePatch = payload.stylePreferences;
      const styleForAnalysis =
        stylePatch && Object.keys(stylePatch).length > 0 ? stylePatch : undefined;

      let analysis: TaskAnalysisResult;
      if (override) {
        analysis = styleForAnalysis ? { ...override, stylePreferences: styleForAnalysis } : override;
      } else {
        const requestedMode = payload.requestedMode ?? "auto";
        const preAnalysis = analyzeTask({
          prompt: p,
          attachments: payload.attachments,
          requestedMode
        });
        const coreMode = payload.templateCoreContent?.requestedMode;
        const memoryHints = getMemoryHintsForTaskWithPrefs(
          loadMemorySnapshot(),
          preAnalysis,
          getTemplateMemoryContext(tid || undefined, {
            workflowTypeHint:
              coreMode === "content" || coreMode === "computer" ? coreMode : undefined
          })
        );
        analysis = analyzeTask({
          prompt: p,
          attachments: payload.attachments,
          requestedMode,
          memoryHints
        });
        if (styleForAnalysis) {
          analysis = { ...analysis, stylePreferences: styleForAnalysis };
        }
      }

      const coreTpl = payload.templateCoreContent;
      if (coreTpl && tid) {
        analysis = {
          ...analysis,
          metadata: {
            ...analysis.metadata,
            templateExecutionContext: {
              templateId: tid,
              sourcePrompt: coreTpl.sourcePrompt,
              requestedMode: coreTpl.requestedMode,
              stepsSnapshot: coreTpl.stepsSnapshot,
              resultSnapshot: coreTpl.resultSnapshot,
              sourceResultKind: coreTpl.sourceResultKind
            }
          }
        };
      }

      void armPipeline(
        p,
        materials,
        tid || undefined,
        analysis,
        payload.attachments,
        payload.planOverride,
        payload.safetyOverride,
        payload.permissionOverrideMap,
        payload.routerDecision ?? null,
        payload.lightMemoryHits?.length ? payload.lightMemoryHits : null,
        payload.submitUserLine?.trim() ? payload.submitUserLine : null
      );
    },
    [armPipeline]
  );

  const pause = useCallback(() => {
    if (!isExecutionActionAllowed(derivedStatusRef.current, "pause")) return;
    generationRef.current += 1;
    clearScheduled(timersRef.current);
    setSnap((s) => ({ ...s, userPaused: true }));
  }, []);

  const resume = useCallback(() => {
    if (!isExecutionActionAllowed(derivedStatusRef.current, "resume")) return;
    generationRef.current += 1;
    const gen = generationRef.current;
    clearScheduled(timersRef.current);
    runMockCompletionTimer(gen);
    setSnap((s) => ({ ...s, userPaused: false, mockStatus: "running" }));
  }, [runMockCompletionTimer]);

  const stop = useCallback(() => {
    if (!isExecutionActionAllowed(derivedStatusRef.current, "stop")) return;
    generationRef.current += 1;
    const gen = generationRef.current;
    clearScheduled(timersRef.current);
    schedule(timersRef.current, () => {
      if (generationRef.current !== gen) return;
      const prevSnap = snapRef.current;
      if (
        loadAppPreferences().dataSafety.allowTaskMemoryWrite &&
        memoryEligibleRef.current &&
        memoryLastRecordedRunIdRef.current !== memoryActiveRunIdRef.current &&
        prevSnap.lastTaskAnalysis
      ) {
        memoryLastRecordedRunIdRef.current = memoryActiveRunIdRef.current;
        void (async () => {
          try {
            const es = eventStreamRef.current;
            const failureMsg = (() => {
              if (prevSnap.lastSafetyResult?.decision === "block")
                return (prevSnap.lastErrorMessage ?? "").trim();
              if (prevSnap.lastPermissionResult?.decision === "block")
                return (prevSnap.lastErrorMessage ?? "").trim();
              if (es.error) return es.error.trim();
              return (prevSnap.lastErrorMessage ?? "").trim();
            })();
            await recordTaskExecution({
              prompt: prevSnap.lastPrompt,
              requestedMode: prevSnap.lastRequestedMode ?? "auto",
              resolvedMode: prevSnap.lastResolvedMode ?? "content",
              analysis: prevSnap.lastTaskAnalysis!,
              executionPlan: prevSnap.executionPlan,
              stepResults: prevSnap.stepResults,
              currentResult: prevSnap.currentResult,
              streamSteps: es.steps ?? null,
              streamResult: es.result ?? null,
              success: false,
              executionQualityContext: { hadDegradedOrWarn: true },
              failureContext: {
                safetyDecision: prevSnap.lastSafetyResult?.decision,
                permissionDecision: prevSnap.lastPermissionResult?.decision,
                lastErrorMessage: failureMsg,
                userInitiatedStop: true,
                emergencyStop: false
              }
            });
          } catch (e) {
            console.error("[memory] recordTaskExecution (stop) failed", e);
          }
        })();
      }
      memoryEligibleRef.current = false;
      sessionRunStartedAtRef.current = null;
      setSnap((prev) => ({
        ...prev,
        mockStatus: "stopped",
        lastErrorMessage: "",
        currentTaskId: "",
        userPaused: false,
        computerExecutionEvents: null,
        lastTaskAnalysis: null,
        executionPlan: null,
        currentStepIndex: 0,
        currentResult: null,
        stepResults: {},
        lastSafetyResult: null,
        permissionSessionGrants: [],
        lastPermissionResult: null,
        lastCoreResultRunId: "",
        lastAuthEscalation: null,
        lastRouterDecision: null
      }));
    }, MOCK_STOP_MS);
    setSnap((s) => ({
      ...s,
      mockStatus: "stopping",
      userPaused: false,
      currentTaskId: ""
    }));
  }, []);

  const retry = useCallback(() => {
    const s = snapRef.current;
    if (!isExecutionActionAllowed(derivedStatusRef.current, "retry")) return;
    const p = s.lastPrompt.trim();
    if (!p) return;
    const requested = s.lastRequestedMode ?? "auto";
    const preAnalysis = analyzeTask({
      prompt: p,
      attachments: s.lastAttachments,
      requestedMode: requested
    });
    const memoryHints = getMemoryHintsForTaskWithPrefs(loadMemorySnapshot(), preAnalysis, null);
    const analysis = analyzeTask({
      prompt: p,
      attachments: s.lastAttachments,
      requestedMode: requested,
      memoryHints
    });
    void armPipeline(
      p,
      [],
      undefined,
      analysis,
      s.lastAttachments,
      undefined,
      undefined,
      undefined,
      s.lastRouterDecision,
      null,
      null
    );
  }, [armPipeline]);

  const emergencyStop = useCallback(() => {
    const st = derivedStatusRef.current;
    if (st === "idle" || st === "success" || st === "error") return;
    memoryEmergencyStopRef.current = true;
    generationRef.current += 1;
    clearScheduled(timersRef.current);
    planStepLockRef.current = null;
    sessionRunStartedAtRef.current = null;
    memoryEligibleRef.current = false;
    scheduleCoreAuditEvent({
      runId: `run-${memoryActiveRunIdRef.current}`,
      taskId: snapRef.current.currentTaskId.trim() || undefined,
      eventType: "emergency_stop",
      reason: "已紧急停止。"
    });
    setSnap((prev) => ({
      ...prev,
      mockStatus: "stopped",
      userPaused: false,
      lastErrorMessage: "已紧急停止。",
      currentTaskId: "",
      computerExecutionEvents: null,
      executionPlan: null,
      currentStepIndex: 0,
      currentResult: null,
      stepResults: {},
      lastSafetyResult: null,
      lastPermissionResult: null,
      lastCoreResultRunId: "",
      lastAuthEscalation: null
    }));
  }, []);

  const clear = useCallback(() => {
    if (!isExecutionActionAllowed(derivedStatusRef.current, "clear")) return;
    generationRef.current += 1;
    clearScheduled(timersRef.current);
    planStepLockRef.current = null;
    sessionRunStartedAtRef.current = null;
    coreSafetyGateRef.current = null;
    permissionOverrideMapRef.current = null;
    corePermissionAllowByCapRef.current = new Set();
    memoryEligibleRef.current = false;
    lastStartedTemplateIdRef.current = "";
    setExecutionSoftWarnings([]);
    setSnap(initialSnap());
  }, []);

  const initFromTask = useCallback((taskId: string, meta?: InitTaskMeta) => {
    setExecutionSoftWarnings([]);
    generationRef.current += 1;
    clearScheduled(timersRef.current);
    planStepLockRef.current = null;
    sessionRunStartedAtRef.current = null;
    coreSafetyGateRef.current = null;
    permissionOverrideMapRef.current = null;
    corePermissionAllowByCapRef.current = new Set();
    memoryEligibleRef.current = false;
    const tid = taskId.trim();
    if (!tid) return;

    if (meta) {
      setSnap({
        mockStatus: mapBackendStatusToExecutionStatus(meta.backendStatus),
        userPaused: false,
        lastPrompt: meta.prompt.trim(),
        lastErrorMessage: "",
        currentTaskId: tid,
        lastRequestedMode: "auto",
        lastResolvedMode: "content",
        lastAttachments: [],
        lastTaskAnalysis: null,
        computerExecutionEvents: null,
        executionPlan: null,
        currentStepIndex: 0,
        currentResult: null,
        stepResults: {},
        lastSafetyResult: null,
        permissionSessionGrants: [],
        lastPermissionResult: null,
        lastCoreResultRunId: "",
        lastAuthEscalation: null,
        lastRouterDecision: null
      });
      return;
    }

    return void fetchTaskSnapshot(tid)
      .then((data) => {
        const task = data.task;
        const input =
          task && typeof (task as { input?: unknown }).input === "object"
            ? ((task as { input?: Record<string, unknown> }).input ?? {})
            : {};
        const p = String(task.prompt ?? input.oneLinePrompt ?? "").trim();
        const errSumm = task.lastErrorSummary;
        const err =
          errSumm != null && errSumm !== "" ? String(errSumm) : "";
        setSnap({
          mockStatus: mapBackendStatusToExecutionStatus(task.status ?? "running"),
          userPaused: false,
          lastPrompt: p,
          lastErrorMessage: err,
          currentTaskId: tid,
          lastRequestedMode: "auto",
          lastResolvedMode: "content",
          lastAttachments: [],
          lastTaskAnalysis: null,
          computerExecutionEvents: null,
          executionPlan: null,
          currentStepIndex: 0,
          currentResult: null,
          stepResults: {},
          lastSafetyResult: null,
          permissionSessionGrants: [],
          lastPermissionResult: null,
          lastCoreResultRunId: "",
          lastAuthEscalation: null,
          lastRouterDecision: null
        });
      })
      .catch((e) => {
        setSnap({
          ...initialSnap(),
          mockStatus: "error",
          lastErrorMessage: axiosDetail(e)
        });
      });
  }, []);

  useEffect(() => {
    if (status !== "running") return;
    if (sessionRunStartedAtRef.current == null) {
      sessionRunStartedAtRef.current = Date.now();
    }

    const cur = snapRef.current;
    const plan = cur.executionPlan;
    if (!plan?.steps.length) return;
    const idx = cur.currentStepIndex;
    if (idx >= plan.steps.length) return;

    const budget = executionBudgetRef.current;
    if (budget.maxSteps > 0 && idx >= budget.maxSteps) {
      generationRef.current += 1;
      planStepLockRef.current = null;
      scheduleCoreAuditEvent({
        runId: `run-${memoryActiveRunIdRef.current}`,
        taskId: snapRef.current.currentTaskId.trim() || undefined,
        eventType: "execution_budget_exceeded",
        decision: "max_steps",
        reason: `执行步数已达上限（${budget.maxSteps}），已停止。`
      });
      setSnap((prev) => ({
        ...prev,
        mockStatus: "error",
        lastErrorMessage: `执行步数已达上限（${budget.maxSteps}），已停止。`,
        lastAuthEscalation: null
      }));
      return;
    }
    if (budget.maxDurationMs > 0 && sessionRunStartedAtRef.current != null) {
      const elapsed = Date.now() - sessionRunStartedAtRef.current;
      if (elapsed > budget.maxDurationMs) {
        generationRef.current += 1;
        planStepLockRef.current = null;
        scheduleCoreAuditEvent({
          runId: `run-${memoryActiveRunIdRef.current}`,
          taskId: snapRef.current.currentTaskId.trim() || undefined,
          eventType: "execution_budget_exceeded",
          decision: "max_duration_ms",
          reason: `执行超时（${budget.maxDurationMs}ms），已停止。`
        });
        setSnap((prev) => ({
          ...prev,
          mockStatus: "error",
          lastErrorMessage: `执行超时（${budget.maxDurationMs}ms），已停止。`,
          lastAuthEscalation: null
        }));
        return;
      }
    }

    const step = plan.steps[idx];
    if (step.status !== "pending") return;

    const gen = generationRef.current;
    const lockKey = `${gen}-${idx}`;
    if (planStepLockRef.current === lockKey) return;

    if (step.type === "human_confirm") {
      planStepLockRef.current = lockKey;
      setSnap((prev) => ({
        ...prev,
        executionPlan: mapExecutionPlanStepStatus(prev.executionPlan!, idx, { status: "waiting_confirm" })
      }));
      return;
    }

    if (step.type === "capability") {
      planStepLockRef.current = lockKey;
      setSnap((prev) => ({
        ...prev,
        executionPlan: mapExecutionPlanStepStatus(prev.executionPlan!, idx, { status: "running" })
      }));
      const planForCap = cur.executionPlan!;
      const previousResults = orderedStepResultsForExecutionPlan(planForCap, cur.stepResults);
      void Promise.resolve().then(() => {
        if (generationRef.current !== gen) return;
        const res = runCapabilityStep(step, {
          basePrompt: cur.lastPrompt.trim(),
          priorResults: previousResults
        });
        if (!res.ok) {
          setSnap((prev) => {
            if (generationRef.current !== gen) return prev;
            const p = prev.executionPlan!;
            const marked = mapExecutionPlanStepStatus(p, idx, { status: "error" });
            return {
              ...prev,
              executionPlan: { ...marked, status: "error" },
              mockStatus: "error",
              lastErrorMessage: res.error || "capability_execution_error",
              lastAuthEscalation: null
            };
          });
          return;
        }
        const capType = String(step.input.capabilityType ?? "");
        const op = String(step.input.operation ?? "");
        const unified = taskResultFromCapabilityStep(step, res.title, res.body, res.summary);
        const out = {
          kind: "capability" as const,
          source: capabilityStepTaskResultSource(),
          title: res.title,
          body: res.body,
          summary: res.summary,
          capabilityType: capType,
          operation: op
        };
        setSnap((prev) => {
          if (generationRef.current !== gen) return prev;
          const p = prev.executionPlan!;
          const nextPlan = mapExecutionPlanStepStatus(p, idx, { status: "success", output: out });
          const nextIdx = idx + 1;
          const nextStepResults: Record<string, TaskResult> = { ...prev.stepResults, [step.stepId]: unified };
          const aggregated = aggregateExecutionStepResults(nextPlan, nextStepResults);
          const base: SessionSnapshot = {
            ...prev,
            executionPlan: nextPlan,
            currentStepIndex: nextIdx,
            stepResults: nextStepResults,
            currentResult: aggregated ?? unified
          };
          if (nextIdx >= nextPlan.steps.length) {
            const finalAgg = aggregateExecutionStepResults(nextPlan, nextStepResults);
            return {
              ...base,
              executionPlan: { ...nextPlan, status: "success" },
              currentResult: finalAgg ?? base.currentResult,
              mockStatus: "success",
              lastErrorMessage: "",
              lastAuthEscalation: null
            };
          }
          return base;
        });
      });
      return;
    }

    if (isLocalExecutionStepType(step.type)) {
      planStepLockRef.current = lockKey;
      setSnap((prev) => ({
        ...prev,
        executionPlan: mapExecutionPlanStepStatus(prev.executionPlan!, idx, { status: "running" })
      }));
      void runLocalExecutionPlanStep(step).then((res) => {
        if (generationRef.current !== gen) return;
        if (!res.ok) {
          setSnap((prev) => {
            if (generationRef.current !== gen) return prev;
            const p = prev.executionPlan!;
            const marked = mapExecutionPlanStepStatus(p, idx, { status: "error" });
            return {
              ...prev,
              executionPlan: { ...marked, status: "error" },
              mockStatus: "error",
              lastErrorMessage: res.error || "local_runtime_error",
              lastAuthEscalation: null
            };
          });
          return;
        }
        const unified = taskResultFromLocalRuntimeStep(step, res.title, res.body, res.summary);
        const out = {
          kind: "content" as const,
          source: localRuntimeStepTaskResultSource(),
          title: res.title,
          body: res.body,
          summary: res.summary,
          action: "local_runtime"
        };
        setSnap((prev) => {
          if (generationRef.current !== gen) return prev;
          const p = prev.executionPlan!;
          const nextPlan = mapExecutionPlanStepStatus(p, idx, { status: "success", output: out });
          const nextIdx = idx + 1;
          const nextStepResults: Record<string, TaskResult> = { ...prev.stepResults, [step.stepId]: unified };
          const aggregated = aggregateExecutionStepResults(nextPlan, nextStepResults);
          const base: SessionSnapshot = {
            ...prev,
            executionPlan: nextPlan,
            currentStepIndex: nextIdx,
            stepResults: nextStepResults,
            currentResult: aggregated ?? unified
          };
          if (nextIdx >= nextPlan.steps.length) {
            const finalAgg = aggregateExecutionStepResults(nextPlan, nextStepResults);
            return {
              ...base,
              executionPlan: { ...nextPlan, status: "success" },
              currentResult: finalAgg ?? base.currentResult,
              mockStatus: "success",
              lastErrorMessage: "",
              lastAuthEscalation: null
            };
          }
          return base;
        });
      });
      return;
    }

    const runModelStep = (stepKind: "generate" | "summarize") => {
      planStepLockRef.current = lockKey;
      setSnap((prev) => ({
        ...prev,
        executionPlan: mapExecutionPlanStepStatus(prev.executionPlan!, idx, { status: "running" })
      }));
      const planForContent = cur.executionPlan!;
      const previousResults = orderedStepResultsForExecutionPlan(planForContent, cur.stepResults);
      const stepPrompt =
        stepKind === "summarize"
          ? `${cur.lastPrompt.trim()}\n\n【总结步骤：${step.title}】\n${step.description}\n\n本步仅依据前序步骤已产出内容做摘要、压缩与结构化整理，不得当作全新主题扩写。`
          : `${cur.lastPrompt.trim()}\n\n【流水线步骤：${step.title}】\n${step.description}`;
      const taskStep = toContentTaskStepForExecutor(step);
      void executeContentAction({
        action: stepKind === "summarize" ? "summarize_result" : "generate",
        prompt: stepPrompt,
        planStep: taskStep,
        previousResults,
        computerEvents: cur.computerExecutionEvents,
        stylePreferences: cur.lastTaskAnalysis?.stylePreferences,
        memoryReferenceLines: cur.lastTaskAnalysis?.metadata?.memoryReferenceLines,
        templateExecutionContext: cur.lastTaskAnalysis?.metadata?.templateExecutionContext
      })
        .then((result) => {
          if (generationRef.current !== gen) return;
          const unified = toTaskResult(result);
          if (!unified) return;
          const src = resolveContentStepOutputSource(unified, result);
          const out = {
            kind: "content" as const,
            source: src,
            title: result.title,
            body: result.body,
            summary: result.summary,
            action: result.action
          };
          setSnap((prev) => {
            if (generationRef.current !== gen) return prev;
            const p = prev.executionPlan!;
            const nextPlan = mapExecutionPlanStepStatus(p, idx, { status: "success", output: out });
            const nextIdx = idx + 1;
            const nextStepResults: Record<string, TaskResult> = { ...prev.stepResults, [step.stepId]: unified };
            const aggregated = aggregateExecutionStepResults(nextPlan, nextStepResults);
            const keepSharedCoreAi =
              prev.lastRouterDecision != null &&
              prev.currentResult?.metadata?._source === "shared_core_create_task";
            const base: SessionSnapshot = {
              ...prev,
              executionPlan: nextPlan,
              currentStepIndex: nextIdx,
              stepResults: nextStepResults,
              currentResult: keepSharedCoreAi
                ? prev.currentResult
                : aggregated ?? unified
            };
            if (nextIdx >= nextPlan.steps.length) {
              const finalAgg = aggregateExecutionStepResults(nextPlan, nextStepResults);
              return {
                ...base,
                executionPlan: { ...nextPlan, status: "success" },
                currentResult: keepSharedCoreAi
                  ? prev.currentResult
                  : finalAgg ?? base.currentResult,
                mockStatus: "success",
                lastErrorMessage: "",
                lastAuthEscalation: null
              };
            }
            return base;
          });
        })
        .catch(() => {
          if (generationRef.current !== gen) return;
          setSnap((prev) => {
            if (generationRef.current !== gen) return prev;
            const p = prev.executionPlan!;
            const marked = mapExecutionPlanStepStatus(p, idx, { status: "error" });
            return {
              ...prev,
              executionPlan: { ...marked, status: "error" },
              mockStatus: "error",
              lastErrorMessage: "content_execution_error",
              lastAuthEscalation: null
            };
          });
        });
    };

    if (step.type === "generate") {
      runModelStep("generate");
      return;
    }

    if (step.type === "summarize") {
      runModelStep("summarize");
      return;
    }

    planStepLockRef.current = lockKey;
    setSnap((prev) => {
      if (generationRef.current !== gen) return prev;
      const p = prev.executionPlan!;
      return {
        ...prev,
        executionPlan: { ...mapExecutionPlanStepStatus(p, idx, { status: "error" }), status: "error" },
        mockStatus: "error",
        lastErrorMessage: "unsupported_step_type",
        lastAuthEscalation: null
      };
    });
  }, [status, snap.executionPlan, snap.currentStepIndex, appendExecutionWarning]);

  const confirmCurrentStep = useCallback(() => {
    setSnap((prev) => {
      const plan = prev.executionPlan;
      if (!plan) return prev;
      const idx = prev.currentStepIndex;
      const st = plan.steps[idx];
      if (!st || st.type !== "human_confirm" || st.status !== "waiting_confirm") return prev;
      const grantKeys = readPermissionGrantKeysFromStep(st.metadata);
      const nextGrants =
        grantKeys.length > 0
          ? [...new Set([...prev.permissionSessionGrants, ...grantKeys])]
          : prev.permissionSessionGrants;
      const nextPlan = mapExecutionPlanStepStatus(plan, idx, { status: "success" });
      planStepLockRef.current = null;
      return {
        ...prev,
        permissionSessionGrants: nextGrants,
        executionPlan: nextPlan,
        currentStepIndex: idx + 1
      };
    });
  }, []);

  const rejectCurrentStep = useCallback(() => {
    setSnap((prev) => {
      const plan = prev.executionPlan;
      if (!plan) return prev;
      const idx = prev.currentStepIndex;
      const st = plan.steps[idx];
      if (!st || st.type !== "human_confirm" || st.status !== "waiting_confirm") return prev;
      planStepLockRef.current = null;
      memoryEligibleRef.current = false;
      const nextPlan = mapExecutionPlanStepStatus(plan, idx, { status: "stopped" });
      return {
        ...prev,
        executionPlan: { ...nextPlan, status: "stopped" },
        mockStatus: "stopped",
        lastErrorMessage: "",
        lastAuthEscalation: null
      };
    });
  }, []);

  const dispatch = useCallback(
    (action: ExecutionAction) => {
      switch (action) {
        case "start":
          return;
        case "pause":
          pause();
          return;
        case "resume":
          resume();
          return;
        case "stop":
          stop();
          return;
        case "retry":
          retry();
          return;
        case "clear":
          clear();
          return;
        default:
      }
    },
    [pause, resume, stop, retry, clear]
  );

  const phase = useMemo(() => statusToActivePhase(status), [status]);
  const allowedActions = useMemo(() => getAllowedActions(status), [status]);
  const isBusy = useMemo(() => isExecutionInProgress(status), [status]);

  const requestedMode = snap.lastRequestedMode ?? "auto";
  const resolvedMode = snap.lastResolvedMode ?? "content";

  const lastAuthEscalationForUi = useMemo(() => {
    if (status !== "error") return null;
    if (eventStream.error?.trim()) return null;
    return snap.lastAuthEscalation;
  }, [status, eventStream.error, snap.lastAuthEscalation]);

  return {
    status,
    phase,
    lastPrompt: snap.lastPrompt,
    lastErrorMessage,
    lastAuthEscalation: lastAuthEscalationForUi,
    currentTaskId: snap.currentTaskId,
    requestedMode,
    resolvedMode,
    eventStream,
    allowedActions,
    computerExecutionEvents: snap.computerExecutionEvents,
    executionPlan: snap.executionPlan,
    currentStepIndex: snap.currentStepIndex,
    confirmCurrentStep,
    rejectCurrentStep,
    currentResult: snap.currentResult,
    stepResults: snap.stepResults,
    lastSafetyResult: snap.lastSafetyResult,
    lastPermissionResult: snap.lastPermissionResult,
    lastCoreResultRunId: snap.lastCoreResultRunId,
    start,
    initFromTask,
    dispatch,
    pause,
    resume,
    stop,
    emergencyStop,
    retry,
    clear,
    isBusy,
    executionSoftWarnings,
    lastTaskAnalysis: snap.lastTaskAnalysis,
    rerunAsNormalContent,
    lastRouterDecision: snap.lastRouterDecision
  };
}
