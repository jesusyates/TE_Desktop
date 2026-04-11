import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { resolveWorkbenchInitialTaskMode } from "../../services/settingsPreferencesService";
import { loadHotSnapshot, schedulePersistHotState } from "../../services/stateRestoration";
import {
  clearWorkbenchDraftAfterSuccessfulSubmit,
  getInitialWorkbenchDraftInput,
  scheduleWorkbenchDraftPersist
} from "../../services/workbenchDraftRestoration";
import {
  executionStatusToBackendPersistence,
  loadWorkbenchUiSnapshot,
  persistWorkbenchUiSnapshot,
  turnFrozenForDisplay,
  type WorkbenchTurnFrozen,
  type WorkbenchUiTurn
} from "../../services/workbenchUiPersistence";
import { getStylePreferencesSnapshot } from "../../services/stylePreferencesService";
import type { StartTaskPayload } from "../../types/task";
import type { TaskMode } from "../../types/taskMode";
import type { TaskAnalysisResult } from "../../modules/workbench/analyzer/taskAnalyzerTypes";
import type { TaskPlan } from "../../modules/workbench/planner/taskPlanTypes";
import type { ExecutionPlan } from "../../modules/workbench/execution/executionPlanTypes";
import { liftTaskPlanToExecutionPlan } from "../../modules/workbench/execution/executionPlanAdapters";
import { getContentCapabilityBannerCopy } from "../../modules/workbench/execution/contentCapabilityRecognition";
import type { SafetyCheckResult } from "../../modules/safety/safetyTypes";
import type { PermissionCheckResult } from "../../modules/permissions/permissionTypes";
import {
  analyzeTaskOnCore,
  type ClarificationQuestion,
  mergeControllerAlignment,
  permissionCheckOnCore,
  planTaskOnCore,
  recordTaskPromptToAiGatewayBestEffort,
  safetyCheckOnCore
} from "../../services/api";
import {
  getMockPlatformEnabledPermissions,
  getMockUserGrantedPermissions
} from "../../modules/permissions/permissionDefaults";
import { analyzeTask } from "../../modules/workbench/analyzer/taskAnalyzer";
import { planTask } from "../../modules/workbench/planner/taskPlanner";
import { ExecutionPlanStepsPanel } from "../workbench/execution/ExecutionPlanStepsPanel";
import { getMemoryHintsForTaskWithPrefs } from "../../modules/preferences/memoryHintsFromPrefs";
import { loadMemorySnapshot } from "../../modules/memory/memoryStore";
import { writeModePreferenceToCore } from "../../modules/memory/memoryWriteService";
import {
  effectiveWorkbenchRequestedMode,
  loadWorkbenchCoreMemoryHintsBestEffort,
  mergeStylePreferencesWithMemoryOverlay
} from "../../modules/memory/workbenchCoreMemoryHints";
import { loadAppPreferences, subscribeAppPreferences } from "../../modules/preferences/appPreferences";
import type { ExecutionTrustAssessment } from "../../modules/trust/trustTypes";
import { computeClientTrustV1, runWithTrustGate } from "../../modules/trust/trustPolicy";
import { mergeClarificationIntoSubmit } from "../../modules/clarification/mergeClarificationIntoSubmit";
import { TaskClarificationPanel } from "../../modules/clarification/TaskClarificationPanel";
import { TrustL2ConfirmModal } from "../../modules/trust/TrustGate";
import { isLocalRuntimeIntent } from "../../modules/workbench/execution/localRuntimeIntent";
import { bumpTemplateUseCount } from "../../services/templateUseStatsStorage";
import type { ExecutionStatus } from "../../execution/session/execution";
import { isExecutionTerminal } from "../../execution/session/execution";
import { useExecutionSession } from "../../execution/session/useExecutionSession";
import type { TaskResult } from "../../modules/result/resultTypes";
import { isLocalRuntimeSummaryOnlyForPersistence } from "../../modules/result/taskResultLocalRetention";
import { isMockPlaceholderTaskResult } from "../../modules/result/mockResultUi";
import { QuickAccessPanel } from "../workbench/QuickAccessPanel";
import { ContentIntelWorkbenchPanel } from "../workbench/ContentIntelWorkbenchPanel";
import { SaveAsTemplateButton } from "../../modules/templates/components/SaveAsTemplateButton";
import { TemplateRunForm } from "../../modules/templates/components/TemplateRunForm";
import { useTemplateLibrary } from "../../modules/templates/hooks/useTemplateLibrary";
import { applyTemplateVariables } from "../../modules/templates/lib/templateVariables";
import type { Template, TemplateResultSnapshot, TemplateRunInput } from "../../modules/templates/types/template";
import "../../modules/templates/template-library.css";
import { ExecutionReplayPanel } from "../../modules/replay/ExecutionReplayPanel";
import { useExecutionReplay } from "../../modules/replay/useExecutionReplay";
import { useUiStrings } from "../../i18n/useUiStrings";
import { useWorkbenchExecutionStallHints } from "../../hooks/useWorkbenchExecutionStallHints";
import { ChatInputBar, type AppliedTemplateSource } from "../workbench/chat/ChatInputBar";
import { WorkbenchFrozenTurnBody } from "../workbench/chat/WorkbenchFrozenTurnBody";
import { ControllerPlanTimeline } from "../workbench/chat/ControllerPlanTimeline";
import { ExecutionTimelineArea } from "../workbench/chat/ExecutionTimelineArea";
import {
  runControllerEngineV1,
  syncControllerStepsWithSession,
  type ControllerTemplateFormalMetaV1,
  type ControllerTemplateProvenanceV1
} from "../../modules/controller";
import { ExecutionResultPanel } from "../workbench/execution/result/ExecutionResultPanel";
import type { RouterDecision } from "../../modules/router/routerTypes";
import {
  applyHistoryJaccardHint,
  buildDefaultArticlePrompt,
  SEO_LITE_ARTICLE_PROMPT_MARKER
} from "../../modules/workbench/workbenchSeoLiteClose";
import { applyLightMemoryInfluence } from "../../modules/memory/lightMemoryEvolution";
import { parseGoalIntentFromUserLine, persistNewActiveGoal } from "../../modules/workbench/activeGoalStore";
import { formatIntentPreviewPrimaryLine, type PendingIntentPreviewStateV1 } from "../../modules/workbench/intentEnrichment";
import { buildEnrichedIntentWithAI } from "../../modules/workbench/intentEnrichmentAI";
import { ResultAssetStarButton } from "../../modules/workbench/ResultAssetStarButton";
import {
  completionFingerprint,
  isWorkflowChainAllowed,
  pickFirstNextSuggestion,
  WORKFLOW_CHAIN_MAX_AUTO_STEPS_V1
} from "../../modules/workbench/workflowChain";
import { ComputerExecutionPanel } from "../workbench/computer/ComputerExecutionPanel";
import { mapExecutionTaskToTaskVM, mapWorkbenchTimelineToTaskVM } from "../../viewmodels";
import type { ExecutionTask } from "../../execution/execution.types";
import { fetchHistoryRecord } from "../../services/history.api";
import { executionApi } from "../../services/execution.api";
import { deriveHistoryListProvenance } from "../../modules/history/historyListProvenance";
import { toTaskResult } from "../../modules/result/resultAdapters";
import type { SavedResultRecordV1 } from "../../modules/savedResults/savedResultsTypes";
import { savedRecordToTaskResult } from "../../modules/savedResults/savedResultsTypes";
import { getSavedResult } from "../../modules/savedResults/savedResultsStore";
import { AutomationDraftPreviewPanel } from "../../modules/automation/components/AutomationDraftPreviewPanel";
import { createAutomationFromWorkbenchResult } from "../../modules/automation/createAutomationFromSource";
import { getAutomationRecord } from "../../modules/automation/automationStore";
import { buildAutomationConsoleUrl } from "../../modules/automation/automationNavigation";
import type { AutomationRecord } from "../../modules/automation/automationTypes";
import { isPermissionGrantStepMetadata } from "../../modules/permissions/permissionChecker";
import type { TemplateSaveInferenceContext } from "../../services/templateMetadataInfer";
import { clientSession } from "../../services/clientSession";
import {
  fetchTemplateById,
  normalizeTemplateCoreContent,
  readTemplateDetailTopFields,
  type TemplateCoreContentNormalized
} from "../../services/coreTemplateService";
import { getTemplateMemoryContext, hasTemplateSavedForSource } from "../../services/templateService";
import {
  buildExecutionDataPostureRows,
  formatClientDataSafetyTrace
} from "../../modules/trust/executionDataPosture";
import { DataPostureStrip } from "../workbench/chat/DataPostureStrip";
import "./human-step-confirm.css";

const REPLAY_EMPTY_LOGS: unknown[] = [];
const REPLAY_EMPTY_STEPS: unknown[] = [];

function coerceResultSnapshot(raw: unknown): TemplateResultSnapshot {
  if (raw && typeof raw === "object" && "title" in raw && typeof (raw as { title: unknown }).title === "string") {
    const o = raw as { title: string; bodyPreview?: unknown; stepCount?: unknown };
    return {
      title: o.title,
      bodyPreview: typeof o.bodyPreview === "string" ? o.bodyPreview : "",
      stepCount: typeof o.stepCount === "number" && Number.isFinite(o.stepCount) ? o.stepCount : 0
    };
  }
  return { title: "", bodyPreview: "", stepCount: 0 };
}

function buildControllerTemplateProvenance(args: {
  templateId?: string;
  capturedFormal: ControllerTemplateFormalMetaV1 | null;
  libraryRow: Template | undefined;
}): ControllerTemplateProvenanceV1 | undefined {
  const tid = args.templateId?.trim();
  if (!tid) return undefined;
  const row = args.libraryRow;
  const cap = args.capturedFormal;
  const pairs: [keyof ControllerTemplateFormalMetaV1, string | undefined][] = [
    ["product", cap?.product ?? row?.product],
    ["market", cap?.market ?? row?.market],
    ["locale", cap?.locale ?? row?.locale],
    ["workflowType", cap?.workflowType ?? row?.workflowType],
    ["version", cap?.version ?? row?.version],
    ["audience", cap?.audience ?? row?.audience]
  ];
  const formalMeta: ControllerTemplateFormalMetaV1 = {};
  for (const [k, v] of pairs) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) formalMeta[k] = t;
  }
  const displayName = row?.name?.trim() || tid;
  return {
    source: "template",
    templateId: tid,
    displayName,
    formalMeta
  };
}

/** D-7-4A：可与普通「停止」并存的操作态 */
const EMERGENCY_STOP_ACTIVE = new Set<ExecutionStatus>([
  "validating",
  "queued",
  "running",
  "paused",
  "stopping"
]);

function buildFrozenSnapshot(
  status: ExecutionStatus,
  lastErrorMessage: string,
  streamError: string | undefined,
  currentResult: TaskResult | null
): WorkbenchTurnFrozen {
  const err =
    lastErrorMessage?.trim() ||
    (status === "error" ? streamError?.trim() : "") ||
    undefined;
  if (!currentResult) {
    return { status, errorMessage: err };
  }
  if (currentResult.kind === "content") {
    const persistBody = isLocalRuntimeSummaryOnlyForPersistence(currentResult)
      ? (currentResult.summary || "").trim() || undefined
      : currentResult.body;
    const row: WorkbenchTurnFrozen = {
      status,
      errorMessage: err,
      resultKind: "content",
      resultTitle: currentResult.title,
      resultBody: persistBody
    };
    if (status === "success") {
      row.isMockPlaceholder = isMockPlaceholderTaskResult(currentResult);
    }
    return row;
  }
  const row: WorkbenchTurnFrozen = {
    status,
    errorMessage: err,
    resultKind: "computer",
    resultTitle: currentResult.title,
    resultBody: currentResult.body ?? currentResult.summary
  };
  if (status === "success") {
    row.isMockPlaceholder = isMockPlaceholderTaskResult(currentResult);
  }
  return row;
}

function executionPlansDevMismatch(a: ExecutionPlan, b: ExecutionPlan): boolean {
  if (a.steps.length !== b.steps.length) return true;
  for (let i = 0; i < a.steps.length; i++) {
    if (a.steps[i].type !== b.steps[i].type) return true;
  }
  return false;
}

/**
 * Workbench：主区「时间线 / 输入」+ 右侧历史侧栏（D-7-5J）。
 * D-3-2：单 ExecutionBlock 承载当前会话执行 UI（状态机与数据流未改）。
 * D-7-4Z：**权威执行真相源**为 `useExecutionSession()`；本组件内 Core / AI 网关调用仅增强与旁路记录，执行流不得由其响应状态驱动。
 *
 * D-7-5T 硬规则：每次挂载从 `loadWorkbenchUiSnapshot()` 取初值，禁止模块级缓存导致切页后状态回退。
 */
export const WorkbenchConsole = () => {
  const u = useUiStrings();
  const navigate = useNavigate();
  const initialWorkbenchSnapRef = useRef<ReturnType<typeof loadWorkbenchUiSnapshot> | undefined>(
    undefined
  );
  if (initialWorkbenchSnapRef.current === undefined) {
    initialWorkbenchSnapRef.current = loadWorkbenchUiSnapshot();
  }
  const wbSnap0 = initialWorkbenchSnapRef.current;

  const session = useExecutionSession();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [searchParams, setSearchParams] = useSearchParams();
  const [templateBootstrap, setTemplateBootstrap] = useState<{ key: number; mode: TaskMode } | null>(
    null
  );
  const userId = useAuthStore((s) => s.userId);
  const workbenchInitialTaskMode = useMemo(() => resolveWorkbenchInitialTaskMode(), []);
  const hotOnceRef = useRef<ReturnType<typeof loadHotSnapshot>>(loadHotSnapshot());
  const workbenchSessionHydratedRef = useRef(false);
  const templateLib = useTemplateLibrary();
  const quickAccessTemplates = useMemo(
    () =>
      [...templateLib.templates].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt)).slice(0, 5),
    [templateLib.templates]
  );
  /** D-4-2：模板注入来源（submit 时由 ChatInputBar 写入 templateId） */
  const [appliedTemplate, setAppliedTemplate] = useState<AppliedTemplateSource | null>(null);
  /** D-7-4D：最近一次 start 的 templateId（chip 清除后仍可继承元数据） */
  const [runSeedTemplateId, setRunSeedTemplateId] = useState<string | null>(null);
  /** E-3：GET /templates/:id 成功后供 session.start 透传（须在 async 前快照） */
  const templateCoreContentRef = useRef<TemplateCoreContentNormalized | null>(null);
  /** E-3+：模板正式字段摘要；提交前与 `templateContext` 落盘一致 */
  const templateFormalMetaRef = useRef<ControllerTemplateFormalMetaV1 | null>(null);
  const appliedTemplateRef = useRef<AppliedTemplateSource | null>(null);
  const runSeedTemplateIdRef = useRef<string | null>(null);
  const didRestoreWorkbenchTemplateCtxRef = useRef(false);
  /** E-3：带变量模板在填表期间暂存 Core 规范化 content */
  const pendingCoreForRunFormRef = useRef<TemplateCoreContentNormalized | null>(null);
  /** D-4-4：带变量模板先填参再注入 */
  const [runFormTemplate, setRunFormTemplate] = useState<Template | null>(null);
  /** E-3：?templateId= 拉取 Core 时的状态 */
  const [templateFromUrlError, setTemplateFromUrlError] = useState<string | null>(null);
  const [templateFromUrlLoading, setTemplateFromUrlLoading] = useState(false);
  const [prompt, setPrompt] = useState(
    () => wbSnap0?.draftInput ?? wbSnap0?.draftPrompt ?? getInitialWorkbenchDraftInput()
  );

  useEffect(() => {
    appliedTemplateRef.current = appliedTemplate;
  }, [appliedTemplate]);
  useEffect(() => {
    runSeedTemplateIdRef.current = runSeedTemplateId;
  }, [runSeedTemplateId]);

  /** 刷新/重进：恢复模板芯片与正式元数据摘要（`templateCoreContent` 仍须在提交前由 URL 引导或本地填表设置） */
  useLayoutEffect(() => {
    if (didRestoreWorkbenchTemplateCtxRef.current) return;
    didRestoreWorkbenchTemplateCtxRef.current = true;
    const tc = initialWorkbenchSnapRef.current?.templateContext;
    if (!tc) return;
    if (tc.appliedTemplate) setAppliedTemplate(tc.appliedTemplate);
    if (tc.runSeedTemplateId !== undefined && tc.runSeedTemplateId !== null) {
      setRunSeedTemplateId(tc.runSeedTemplateId);
    }
    const fm = tc.formalMeta;
    if (fm && Object.values(fm).some((v) => typeof v === "string" && v.trim())) {
      templateFormalMetaRef.current = fm;
    }
  }, []);

  const [replayMode, setReplayMode] = useState(false);
  const [replayFreeze, setReplayFreeze] = useState<{ logs: unknown[]; steps: unknown[] } | null>(null);
  const [replaySerial, setReplaySerial] = useState(0);
  /** J-1+：自任务历史恢复只读快照（关联 Core execution task 时） */
  const [historyReplayTask, setHistoryReplayTask] = useState<ExecutionTask | null>(null);
  /** J-1+：仅有历史摘要、无 execution 详情时 */
  const [historyReadonlyPreview, setHistoryReadonlyPreview] = useState<{
    prompt: string;
    status: ExecutionStatus;
    unifiedResult: TaskResult;
  } | null>(null);
  /** Saved Results v1：用户主动保存的资产只读回看（本地，与任务历史语义分离） */
  const [savedResultReadonlyPreview, setSavedResultReadonlyPreview] = useState<SavedResultRecordV1 | null>(null);
  const clearSavedResultReadonlyPreview = useCallback(() => setSavedResultReadonlyPreview(null), []);
  /** Automation Console：本地自动化草案只读预览（编排资产，非历史、非已保存结果） */
  const [automationReadonlyPreview, setAutomationReadonlyPreview] = useState<AutomationRecord | null>(null);
  const clearAutomationReadonlyPreview = useCallback(() => setAutomationReadonlyPreview(null), []);
  const [automationDraftLoadHint, setAutomationDraftLoadHint] = useState<string | null>(null);
  const automationHintTimerRef = useRef<number | null>(null);
  /** D-7-3A：Core Backend /task 通道反馈（非阻塞本地 session） */
  const [coreChannelNotice, setCoreChannelNotice] = useState<string | null>(null);
  const coreChannelNoticeTimerRef = useRef<number | null>(null);
  /** D-4：本轮 submit 从 Core Memory 注入的轻量提示（非完整列表） */
  const [appliedWorkbenchMemoryLabels, setAppliedWorkbenchMemoryLabels] = useState<string[]>([]);
  const [workbenchTurns, setWorkbenchTurns] = useState<WorkbenchUiTurn[]>(
    () => wbSnap0?.turns ?? []
  );
  const [liveTurnId, setLiveTurnId] = useState<string | null>(() => wbSnap0?.liveTurnId ?? null);
  const liveTurnIdRef = useRef<string | null>(wbSnap0?.liveTurnId ?? null);
  const workbenchTurnsRef = useRef<WorkbenchUiTurn[]>(wbSnap0?.turns ?? []);
  const promptRef = useRef(
    wbSnap0?.draftInput ?? wbSnap0?.draftPrompt ?? getInitialWorkbenchDraftInput()
  );
  const workbenchUiPersistTimerRef = useRef<number | null>(null);
  /** 用户主动删空主时间线后，不再用 session 自动补种，避免「删光又复活」 */
  const workbenchUserEmptiedRef = useRef(false);
  /** D-7-5W：标记当前从哪条 turn 点了「重新编辑」（仅 UI，不落盘；发送后清空） */
  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  /** D-7-6K：时间线滚动容器（.execution-timeline-area） */
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  /** D-7-6F：`session.start` 前 isBusy 仍为 idle；ref 同步挡连点，state 驱动输入/按钮禁用 */
  const chatSubmitFlightRef = useRef(false);
  /** Intent AI v1：防止预览阶段连点重复请求 */
  const intentPreviewAiFlightRef = useRef(false);
  /** Workflow / Task Chain v1 */
  const chainModeRef = useRef(false);
  const chainAutoRemainingRef = useRef(0);
  const chainLastHandledFingerprintRef = useRef("");
  const [chainModeUi, setChainModeUi] = useState(false);
  /** Result Assetization v1：再生成一版用的原始提交句（与 session.lastPrompt 可能不同） */
  const lastWorkbenchSubmitUserLineRef = useRef("");
  const [chatSubmitInFlight, setChatSubmitInFlight] = useState(false);
  const [goalUiTick, setGoalUiTick] = useState(0);
  const [pendingIntentPreview, setPendingIntentPreview] = useState<PendingIntentPreviewStateV1 | null>(null);
  /** D-7-6G：执行中再次提交时的轻提示（自动消失） */
  const [busySubmitToast, setBusySubmitToast] = useState<string | null>(null);
  const busySubmitToastTimerRef = useRef<number | null>(null);
  /** H-1：设置变更后重读本地偏好（不整页刷新） */
  const [appPrefsRevision, setAppPrefsRevision] = useState(0);
  /** Trust v1：L1 输入区上方一行提示 */
  const [trustInlineHint, setTrustInlineHint] = useState<string | null>(null);
  const trustHintTimerRef = useRef<number | null>(null);
  const [trustL2Open, setTrustL2Open] = useState(false);
  const trustL2ResolverRef = useRef<((v: boolean) => void) | null>(null);
  /** Task Clarification v1：一次选项确认后再进入 TrustGate / 执行 */
  const [taskClarification, setTaskClarification] = useState<{
    questions: ClarificationQuestion[];
    basePrompt: string;
    payload: StartTaskPayload;
  } | null>(null);

  const es = session.eventStream;

  useEffect(() => subscribeAppPreferences(() => setAppPrefsRevision((n) => n + 1)), []);

  const trustConfirmL2 = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        trustL2ResolverRef.current = resolve;
        setTrustL2Open(true);
      }),
    []
  );

  const onTrustL2Continue = useCallback(() => {
    trustL2ResolverRef.current?.(true);
    trustL2ResolverRef.current = null;
    setTrustL2Open(false);
  }, []);

  const onTrustL2Cancel = useCallback(() => {
    trustL2ResolverRef.current?.(false);
    trustL2ResolverRef.current = null;
    setTrustL2Open(false);
  }, []);

  const flashTrustL1Hint = useCallback((msg: string) => {
    if (trustHintTimerRef.current != null) {
      window.clearTimeout(trustHintTimerRef.current);
      trustHintTimerRef.current = null;
    }
    setTrustInlineHint(msg);
    trustHintTimerRef.current = window.setTimeout(() => {
      setTrustInlineHint(null);
      trustHintTimerRef.current = null;
    }, 8000);
  }, []);

  const showExecutionSourceAndSteps = useMemo(
    () => loadAppPreferences().execution.showExecutionSourceAndSteps,
    [appPrefsRevision]
  );
  const applyMemoryHintsInTasks = useMemo(
    () => loadAppPreferences().memoryTemplate.applyMemoryHintsInTasks,
    [appPrefsRevision]
  );
  const showTemplateDetailLink = useMemo(
    () => loadAppPreferences().memoryTemplate.showTemplateHintInWorkbench,
    [appPrefsRevision]
  );
  const showContentIntelPanel = useMemo(
    () => loadAppPreferences().contentIntelligence.phase1WorkbenchPanel,
    [appPrefsRevision]
  );

  useEffect(() => {
    workbenchTurnsRef.current = workbenchTurns;
  }, [workbenchTurns]);

  useEffect(() => {
    liveTurnIdRef.current = liveTurnId;
  }, [liveTurnId]);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(
    () => () => {
      if (busySubmitToastTimerRef.current != null) {
        window.clearTimeout(busySubmitToastTimerRef.current);
      }
    },
    []
  );

  const flushWorkbenchUiPersist = useCallback(() => {
    const liveId = liveTurnIdRef.current;
    const sess = sessionRef.current;
    const draft = promptRef.current;
    const now = new Date().toISOString();
    /** 落盘时合并当前 session，避免防抖窗口内 live turn 仍停留在 pending */
    const mergedTurns = workbenchTurnsRef.current.map((t) => {
      if (t.id !== liveId) return t;
      if (t.frozen) return t;
      return { ...t, status: sess.status, updatedAt: now };
    });
    persistWorkbenchUiSnapshot({
      restoreVersion: 2,
      savedAt: now,
      turns: mergedTurns,
      liveTurnId: liveId,
      draftInput: draft,
      draftPrompt: draft,
      session: {
        currentTaskId: sess.currentTaskId,
        lastPrompt: sess.lastPrompt,
        status: sess.status
      },
      templateContext: {
        appliedTemplate: appliedTemplateRef.current,
        runSeedTemplateId: runSeedTemplateIdRef.current,
        ...(templateFormalMetaRef.current && Object.keys(templateFormalMetaRef.current).length > 0
          ? { formalMeta: templateFormalMetaRef.current }
          : {})
      }
    });
  }, []);

  const scheduleWorkbenchUiPersist = useCallback(() => {
    if (workbenchUiPersistTimerRef.current != null) {
      window.clearTimeout(workbenchUiPersistTimerRef.current);
    }
    workbenchUiPersistTimerRef.current = window.setTimeout(() => {
      workbenchUiPersistTimerRef.current = null;
      flushWorkbenchUiPersist();
    }, 400);
  }, [flushWorkbenchUiPersist]);

  const openTemplateFromQuickAccess = useCallback(
    (templateId: string) => {
      const id = templateId.trim();
      if (!id) return;
      navigate(`/workbench?templateId=${encodeURIComponent(id)}`);
    },
    [navigate]
  );

  useEffect(() => {
    const cancelScheduled = () => {
      if (workbenchUiPersistTimerRef.current != null) {
        window.clearTimeout(workbenchUiPersistTimerRef.current);
        workbenchUiPersistTimerRef.current = null;
      }
    };
    /** D-7-5T+：关窗/刷新前同步落盘；beforeunload 与 pagehide 互补（不替代 unmount 清理） */
    const syncFlushBeforeDocumentLeave = () => {
      cancelScheduled();
      flushWorkbenchUiPersist();
    };
    window.addEventListener("pagehide", syncFlushBeforeDocumentLeave);
    window.addEventListener("beforeunload", syncFlushBeforeDocumentLeave);
    return () => {
      window.removeEventListener("pagehide", syncFlushBeforeDocumentLeave);
      window.removeEventListener("beforeunload", syncFlushBeforeDocumentLeave);
      cancelScheduled();
      flushWorkbenchUiPersist();
    };
  }, [flushWorkbenchUiPersist]);

  useLayoutEffect(() => {
    if (workbenchSessionHydratedRef.current) return;
    workbenchSessionHydratedRef.current = true;
    const bundle = initialWorkbenchSnapRef.current;
    const s = sessionRef.current;
    const persistedTid = bundle?.session?.currentTaskId?.trim();
    if (
      bundle?.session &&
      persistedTid &&
      !persistedTid.startsWith("core:")
    ) {
      void s.initFromTask(persistedTid, {
        prompt: bundle.session.lastPrompt,
        backendStatus: executionStatusToBackendPersistence(bundle.session.status)
      });
      return;
    }
    const hotTid = hotOnceRef.current?.selectedTaskId?.trim();
    if (hotTid && !hotTid.startsWith("core:")) {
      void s.initFromTask(hotTid);
    }
  }, []);

  const templateSaveInferenceContext = useMemo((): TemplateSaveInferenceContext => {
    const id = runSeedTemplateId?.trim();
    const seedRow = id ? templateLib.getTemplate(id) : undefined;
    const seedTemplate = seedRow
      ? { platform: seedRow.platform, workflowType: seedRow.workflowType }
      : null;
    const hot = loadHotSnapshot();
    const am = hot?.activeMode;
    const activeMode: TaskMode =
      am === "content" || am === "computer" || am === "auto" ? am : "auto";
    return {
      resolvedMode: session.resolvedMode,
      activeMode,
      seedTemplate,
      unifiedResult: session.currentResult,
      streamResult: es.result,
      sourcePrompt: session.lastPrompt
    };
  }, [
    runSeedTemplateId,
    templateLib,
    templateLib.templates,
    session.resolvedMode,
    session.currentResult,
    session.lastPrompt,
    es.result
  ]);

  const templateAlreadySavedForRun = useMemo(
    () =>
      Boolean(
        session.currentTaskId.trim() &&
          hasTemplateSavedForSource(session.currentTaskId, session.lastCoreResultRunId || null)
      ),
    [session.currentTaskId, session.lastCoreResultRunId, templateLib.templates]
  );

  const handleRunFormApply = useCallback(
    (input: TemplateRunInput) => {
      if (!runFormTemplate || runFormTemplate.id !== input.templateId) return;
      const text = applyTemplateVariables(runFormTemplate.sourcePrompt, input.values);
      setPrompt(text);
      setAppliedTemplate({ templateId: runFormTemplate.id, displayName: runFormTemplate.name });
      templateFormalMetaRef.current = {
        ...(runFormTemplate.product?.trim() ? { product: runFormTemplate.product.trim() } : {}),
        ...(runFormTemplate.market?.trim() ? { market: runFormTemplate.market.trim() } : {}),
        ...(runFormTemplate.locale?.trim() ? { locale: runFormTemplate.locale.trim() } : {}),
        ...(runFormTemplate.workflowType?.trim() ? { workflowType: runFormTemplate.workflowType.trim() } : {}),
        ...(runFormTemplate.version?.trim() ? { version: runFormTemplate.version.trim() } : {}),
        ...(runFormTemplate.audience?.trim() ? { audience: runFormTemplate.audience.trim() } : {})
      };
      bumpTemplateUseCount(runFormTemplate.id);
      const pending = pendingCoreForRunFormRef.current;
      if (pending && runFormTemplate.id === input.templateId) {
        templateCoreContentRef.current = { ...pending, sourcePrompt: text };
      }
      pendingCoreForRunFormRef.current = null;
      setRunFormTemplate(null);
    },
    [runFormTemplate]
  );

  const handleRunFormCancel = useCallback(() => {
    pendingCoreForRunFormRef.current = null;
    setRunFormTemplate(null);
  }, []);

  const clearAppliedTemplateSource = useCallback(() => {
    setAppliedTemplate(null);
    templateCoreContentRef.current = null;
    templateFormalMetaRef.current = null;
  }, []);

  const stopWorkflowChain = useCallback(() => {
    chainModeRef.current = false;
    chainAutoRemainingRef.current = 0;
    chainLastHandledFingerprintRef.current = "";
    setChainModeUi(false);
  }, []);

  const handleChatSubmit = useCallback(
    async (payload: StartTaskPayload) => {
      if (session.isBusy) {
        if (busySubmitToastTimerRef.current != null) {
          window.clearTimeout(busySubmitToastTimerRef.current);
        }
        setBusySubmitToast(u.workbench.busySubmitNotice);
        busySubmitToastTimerRef.current = window.setTimeout(() => {
          setBusySubmitToast(null);
          busySubmitToastTimerRef.current = null;
        }, 2800);
        return;
      }
      const p0 = payload.prompt.trim();
      if (!p0) return;
      if (chainModeRef.current && !payload.workflowChainAuto) {
        stopWorkflowChain();
      }
      const bypassIntentPreview =
        Boolean(payload.skipIntentPreview) ||
        replayMode ||
        Boolean(historyReadonlyPreview) ||
        Boolean(savedResultReadonlyPreview) ||
        Boolean(automationReadonlyPreview);
      if (!bypassIntentPreview) {
        if (intentPreviewAiFlightRef.current) return;
        intentPreviewAiFlightRef.current = true;
        try {
          const enrichedIntent = await buildEnrichedIntentWithAI(p0);
          setPendingIntentPreview({
            originalInput: p0,
            enrichedIntent,
            payloadSnapshot: { ...payload, prompt: p0 }
          });
          clearWorkbenchDraftAfterSuccessfulSubmit();
          promptRef.current = "";
          setPrompt("");
        } finally {
          intentPreviewAiFlightRef.current = false;
        }
        return;
      }
      if (payload.skipIntentPreview) {
        setPendingIntentPreview(null);
      }
      if (chatSubmitFlightRef.current) return;
      chatSubmitFlightRef.current = true;
      setChatSubmitInFlight(true);
      const parsedGoal = parseGoalIntentFromUserLine(p0);
      if (parsedGoal) {
        persistNewActiveGoal(parsedGoal);
        setGoalUiTick((n) => n + 1);
      }
      /** E-3：`ChatInputBar` 会在同步返回后立即清 chip/ref；须在任何 await 之前快照 Core content */
      const capturedTemplateCore = templateCoreContentRef.current;
      const capturedTemplateFormalMeta = templateFormalMetaRef.current;
      try {
      /** D-7-5W：从「重新编辑」发送时仍追加新 turn，不覆盖、不删原 turn */
      setEditingTurnId(null);
      setHistoryReadonlyPreview(null);
      setSavedResultReadonlyPreview(null);
      setAutomationReadonlyPreview(null);
      setHistoryReplayTask(null);
      setReplayMode(false);
      setReplayFreeze(null);

      /** D-7-5T：一条 turn = 用户输入 + 随后冻结的结果；单任务执行仍走 session.start */
      workbenchUserEmptiedRef.current = false;
      const runTurnId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      liveTurnIdRef.current = runTurnId;
      setLiveTurnId(runTurnId);
      setWorkbenchTurns((prev) => {
        const next = [
          ...prev,
          {
            id: runTurnId,
            prompt: p0,
            createdAt,
            updatedAt: createdAt,
            status: "pending" as const,
            frozen: null
          }
        ];
        workbenchTurnsRef.current = next;
        return next;
      });

      /** D-7-6L：与 turn 追加同一同步动作内清空输入，不得在 await / session.start 之后 */
      clearWorkbenchDraftAfterSuccessfulSubmit();
      promptRef.current = "";
      setPrompt("");

      const scheduleClearNotice = () => {
        if (coreChannelNoticeTimerRef.current != null) {
          window.clearTimeout(coreChannelNoticeTimerRef.current);
          coreChannelNoticeTimerRef.current = null;
        }
        coreChannelNoticeTimerRef.current = window.setTimeout(() => {
          setCoreChannelNotice(null);
          coreChannelNoticeTimerRef.current = null;
        }, 8000);
      };

      const noticeLines: string[] = [];
      let coreAnalysis: TaskAnalysisResult | null = null;
      let corePlan: TaskPlan | null = null;
      let corePlanTrust: ExecutionTrustAssessment | undefined;
      let coreSafety: SafetyCheckResult | null = null;
      const permissionOverrideMap: Record<string, PermissionCheckResult> = {};
      let routerDecisionForSession: RouterDecision | undefined;

      const [memoryBundle, sessionMarket, sessionLocale] = await Promise.all([
        loadWorkbenchCoreMemoryHintsBestEffort().catch((e) => {
          console.warn("[D-4] workbench memory bundle failed", e);
          return null;
        }),
        clientSession.getMarket(),
        clientSession.getLocale()
      ]);
      const tidSubmit = payload.templateId?.trim();
      const alreadyArticlePack = payload.prompt.includes(SEO_LITE_ARTICLE_PROMPT_MARKER);
      const hasBuiltinArticlePack = !tidSubmit && !capturedTemplateCore && !alreadyArticlePack;
      let executionPrompt = p0;
      let lightMemoryHits: string[] = [];
      if (hasBuiltinArticlePack) {
        executionPrompt = buildDefaultArticlePrompt(p0);
        const mem = applyLightMemoryInfluence(executionPrompt, p0);
        executionPrompt = mem.prompt;
        lightMemoryHits = mem.hits;
        try {
          executionPrompt = await applyHistoryJaccardHint(executionPrompt);
        } catch {
          /* 历史预检失败不阻断 */
        }
      }
      const mergedStyleForSession = mergeStylePreferencesWithMemoryOverlay(
        getStylePreferencesSnapshot(),
        memoryBundle?.styleOverlay ?? {}
      );
      const effectiveRequestedMode = hasBuiltinArticlePack
        ? "content"
        : effectiveWorkbenchRequestedMode(
            payload.requestedMode,
            memoryBundle?.preferredModeFromMemory ?? null
          );
      const memoryHintsPayload =
        memoryBundle?.wire && Object.keys(memoryBundle.wire).length > 0 ? memoryBundle.wire : undefined;
      const showRoundHints = loadAppPreferences().memoryTemplate.showRoundMemoryHintsBar;
      setAppliedWorkbenchMemoryLabels(showRoundHints ? (memoryBundle?.uiLabels ?? []) : []);

      const prefDs = loadAppPreferences().dataSafety;
      const effectiveAttachments = prefDs.sendAttachmentMetadataToCore ? payload.attachments : undefined;
      if ((payload.attachments?.length ?? 0) > 0 && !prefDs.sendAttachmentMetadataToCore) {
        queueMicrotask(() => {
          setBusySubmitToast(u.workbench.dataSafetyAttachmentsOmitted);
          if (busySubmitToastTimerRef.current != null) {
            window.clearTimeout(busySubmitToastTimerRef.current);
          }
          busySubmitToastTimerRef.current = window.setTimeout(() => {
            setBusySubmitToast(null);
            busySubmitToastTimerRef.current = null;
          }, 4200);
        });
      }
      const attachMetaForCore = effectiveAttachments?.map((a) => ({
        name: a.name,
        mimeType: a.mimeType,
        size: a.size
      }));
      const attachCount = effectiveAttachments?.length ?? 0;
      const templateProvenance = buildControllerTemplateProvenance({
        templateId: tidSubmit,
        capturedFormal: capturedTemplateFormalMeta,
        libraryRow: tidSubmit ? templateLib.getTemplate(tidSubmit) : undefined
      });
      const prefsSubmit = loadAppPreferences();
      let controllerPlan = runControllerEngineV1({
        prompt: executionPrompt,
        attachmentsCount: attachCount,
        requestedMode: effectiveRequestedMode,
        intendsCloudAi: effectiveRequestedMode !== "computer",
        sessionMarket,
        sessionLocale,
        templateProvenance
      });
      controllerPlan = {
        ...controllerPlan,
        decisionTrace: {
          ...controllerPlan.decisionTrace,
          client_data_safety: formatClientDataSafetyTrace(prefsSubmit.dataSafety),
          client_trust_auto_cloud: String(prefsSubmit.trust.allowAutoCloudAi)
        }
      };
      setWorkbenchTurns((prev) => {
        const mapped = prev.map((t) => (t.id === runTurnId ? { ...t, controllerPlan } : t));
        workbenchTurnsRef.current = mapped;
        return mapped;
      });

      try {
        const analyzeRes = await analyzeTaskOnCore({
          prompt: executionPrompt,
          requestedMode: effectiveRequestedMode,
          attachments: attachMetaForCore,
          memoryHints: memoryHintsPayload,
          controllerDecision: controllerPlan
        });
        if ("requireClarification" in analyzeRes && analyzeRes.requireClarification) {
          setWorkbenchTurns((prev) => {
            const next = prev.filter((t) => t.id !== runTurnId);
            workbenchTurnsRef.current = next;
            return next;
          });
          liveTurnIdRef.current = null;
          setLiveTurnId(null);
          setPrompt(p0);
          setTaskClarification({
            questions: analyzeRes.questions,
            basePrompt: p0,
            payload: { ...payload, prompt: p0 }
          });
          return;
        }
        const analysis = analyzeRes.analysis;
        coreAnalysis = analysis;
        console.log("[D-7-3C Core Backend /analyze]", analysis);
        noticeLines.push(`Core Analyzer 已接管：${analysis.resolvedMode} / ${analysis.intent}`);

        if (analyzeRes.routerDecision) {
          routerDecisionForSession = analyzeRes.routerDecision;
          setWorkbenchTurns((prev) => {
            const idx = prev.findIndex((x) => x.id === runTurnId);
            if (idx < 0) return prev;
            const now = new Date().toISOString();
            const next = [...prev];
            next[idx] = { ...next[idx], routerDecision: analyzeRes.routerDecision, updatedAt: now };
            workbenchTurnsRef.current = next;
            return next;
          });
        }

        if (analyzeRes.controllerAlignment) {
          setWorkbenchTurns((prev) => {
            const idx = prev.findIndex((x) => x.id === runTurnId);
            if (idx < 0) return prev;
            const row = prev[idx];
            const merged = mergeControllerAlignment(row.coreControllerAlignment ?? undefined, analyzeRes.controllerAlignment);
            if (!merged) return prev;
            const now = new Date().toISOString();
            const next = [...prev];
            next[idx] = { ...row, coreControllerAlignment: merged, updatedAt: now };
            workbenchTurnsRef.current = next;
            return next;
          });
          if (import.meta.env.DEV) {
            console.log("[Controller↔Core] after /analyze", analyzeRes.controllerAlignment);
          }
        }

        if (import.meta.env.DEV) {
          const local = analyzeTask({
            prompt: executionPrompt,
            attachments: effectiveAttachments,
            requestedMode: effectiveRequestedMode
          });
          const capsEqual =
            JSON.stringify(local.candidateCapabilities) ===
            JSON.stringify(analysis.candidateCapabilities);
          if (
            local.resolvedMode !== analysis.resolvedMode ||
            local.intent !== analysis.intent ||
            !capsEqual
          ) {
            console.warn("[D-7-3C] local/core analysis mismatch", { local, core: analysis });
          }
        }
      } catch (e) {
        console.error("[D-7-3C Core Backend /analyze] failed", e);
        noticeLines.push(
          e instanceof Error
            ? `Core Analyzer 失败，已切换本地分析（${e.message}）`
            : "Core Analyzer 失败，已切换本地分析"
        );
      }

      if (coreAnalysis) {
        try {
          const planRes = await planTaskOnCore({
            prompt: executionPrompt,
            requestedMode: effectiveRequestedMode,
            attachments: attachMetaForCore,
            analysis: coreAnalysis,
            memoryHints: memoryHintsPayload,
            controllerDecision: controllerPlan
          });
          corePlan = planRes.plan;
          coreAnalysis = planRes.analysis;
          corePlanTrust = planRes.trust;
          console.log("[D-7-3D Core Backend /plan]", planRes.plan);
          noticeLines.push(`Core Planner 已接管：${planRes.plan.steps.length} steps`);

          if (planRes.routerDecision) {
            routerDecisionForSession = planRes.routerDecision;
            setWorkbenchTurns((prev) => {
              const idx = prev.findIndex((x) => x.id === runTurnId);
              if (idx < 0) return prev;
              const now = new Date().toISOString();
              const next = [...prev];
              next[idx] = { ...next[idx], routerDecision: planRes.routerDecision, updatedAt: now };
              workbenchTurnsRef.current = next;
              return next;
            });
          }

          if (planRes.controllerAlignment) {
            setWorkbenchTurns((prev) => {
              const idx = prev.findIndex((x) => x.id === runTurnId);
              if (idx < 0) return prev;
              const row = prev[idx];
              const merged = mergeControllerAlignment(row.coreControllerAlignment ?? undefined, planRes.controllerAlignment);
              if (!merged) return prev;
              const now = new Date().toISOString();
              const next = [...prev];
              next[idx] = { ...row, coreControllerAlignment: merged, updatedAt: now };
              workbenchTurnsRef.current = next;
              return next;
            });
            if (import.meta.env.DEV) {
              console.log("[Controller↔Core] after /plan", planRes.controllerAlignment);
            }
          }

          if (import.meta.env.DEV) {
            const cm = capturedTemplateCore?.requestedMode;
            const memoryHints = getMemoryHintsForTaskWithPrefs(
              loadMemorySnapshot(),
              coreAnalysis,
              getTemplateMemoryContext(payload.templateId, {
                workflowTypeHint: cm === "content" || cm === "computer" ? cm : undefined
              })
            );
            const localPlan = planTask(coreAnalysis, { memoryHints });
            const coreEp = liftTaskPlanToExecutionPlan(planRes.plan, "core-dev");
            if (executionPlansDevMismatch(coreEp, localPlan)) {
              console.warn("[D-7-3D] local/core plan mismatch", {
                localPlan,
                corePlan: planRes.plan
              });
            }
          }
        } catch (e) {
          console.error("[D-7-3D Core Backend /plan] failed", e);
          noticeLines.push(
            e instanceof Error
              ? `Core Planner 失败，已切换本地规划（${e.message}）`
              : "Core Planner 失败，已切换本地规划"
          );
        }
      }

      const analysisForLocalPlan =
        coreAnalysis ??
        analyzeTask({
          prompt: executionPrompt,
          attachments: effectiveAttachments,
          requestedMode: effectiveRequestedMode
        });
      const cmTrust = capturedTemplateCore?.requestedMode;
      const memoryHintsForTrustPlan = getMemoryHintsForTaskWithPrefs(
        loadMemorySnapshot(),
        analysisForLocalPlan,
        getTemplateMemoryContext(payload.templateId, {
          workflowTypeHint: cmTrust === "content" || cmTrust === "computer" ? cmTrust : undefined
        })
      );
      const effectivePlanForTrust =
        isLocalRuntimeIntent(analysisForLocalPlan.intent) || !corePlan
          ? planTask(analysisForLocalPlan, { memoryHints: memoryHintsForTrustPlan, taskId: "trust-eval" })
          : corePlan ?? planTask(analysisForLocalPlan, { memoryHints: memoryHintsForTrustPlan, taskId: "trust-eval" });

      const prefsTrust = loadAppPreferences();
      const assessment = isLocalRuntimeIntent(analysisForLocalPlan.intent)
        ? computeClientTrustV1(effectivePlanForTrust, memoryHintsPayload)
        : corePlanTrust ?? computeClientTrustV1(effectivePlanForTrust, memoryHintsPayload);

      const trustOk = await runWithTrustGate(assessment, {
        allowAutoCloudAI: prefsTrust.trust.allowAutoCloudAi,
        strings: {
          l2Message: u.workbench.trustL2Message,
          l2Continue: u.workbench.trustL2Continue,
          l2Cancel: u.workbench.trustL2Cancel,
          l1MemoryHint: u.workbench.trustL1MemoryHint,
          l3BlockedToast: u.workbench.trustBlocked
        },
        onL1Hint: flashTrustL1Hint,
        confirmL2: trustConfirmL2,
        onL3Blocked: (msg) => {
          setBusySubmitToast(msg);
          if (busySubmitToastTimerRef.current != null) {
            window.clearTimeout(busySubmitToastTimerRef.current);
            busySubmitToastTimerRef.current = null;
          }
          busySubmitToastTimerRef.current = window.setTimeout(() => {
            setBusySubmitToast(null);
            busySubmitToastTimerRef.current = null;
          }, 5000);
        }
      });

      if (!trustOk) {
        setWorkbenchTurns((prev) => {
          const next = prev.filter((t) => t.id !== runTurnId);
          workbenchTurnsRef.current = next;
          return next;
        });
        liveTurnIdRef.current = null;
        setLiveTurnId(null);
        setPrompt(p0);
        return;
      }

      if (coreAnalysis) {
        try {
          const sc = await safetyCheckOnCore({
            prompt: executionPrompt,
            analysis: coreAnalysis,
            ...(corePlan ? { plan: corePlan } : {})
          });
          coreSafety = sc.safety;
          console.log("[D-7-3E Core Backend /safety-check]", sc.safety);
          noticeLines.push(`Core Safety：${sc.safety.decision}`);
        } catch (e) {
          console.error("[D-7-3E Core Backend /safety-check] failed", e);
          noticeLines.push(
            e instanceof Error
              ? `Core Safety 失败，已切换本地校验（${e.message}）`
              : "Core Safety 失败，已切换本地校验"
          );
        }
      }

      if (corePlan) {
        const capIds = [
          ...new Set(
            corePlan.steps
              .filter((s) => s.type === "capability" && s.capabilityId)
              .map((s) => s.capabilityId as string)
          )
        ];
        const userGranted = getMockUserGrantedPermissions();
        const platformEnabled = getMockPlatformEnabledPermissions();
        for (const cid of capIds) {
          try {
            const r = await permissionCheckOnCore({
              capabilityId: cid,
              userGrantedPermissions: userGranted,
              platformEnabledPermissions: platformEnabled
            });
            permissionOverrideMap[cid] = r.permission;
            console.log("[D-7-3F Core Backend /permission-check]", cid, r.permission);
            noticeLines.push(`Core Permission：${cid} / ${r.permission.decision}`);
          } catch (e) {
            console.error("[D-7-3F Core Backend /permission-check] failed", cid, e);
          }
        }
      }

      /** D-7-4Z：`/task` 旁路；尊重 Data Safety「服务端历史/旁路写入」门控 */
      if (loadAppPreferences().dataSafety.allowServerHistoryWrite) {
        await recordTaskPromptToAiGatewayBestEffort(executionPrompt, routerDecisionForSession);
      }

      setCoreChannelNotice(noticeLines.length ? noticeLines.join("\n") : null);
      scheduleClearNotice();

      setRunSeedTemplateId(payload.templateId?.trim() || null);

      const {
        skipIntentPreview: _omitSkipPreview,
        workflowChainAuto: _omitWorkflowChainAuto,
        ...payloadForSession
      } = payload;
      lastWorkbenchSubmitUserLineRef.current = p0;
      session.start({
        ...payloadForSession,
        prompt: executionPrompt,
        requestedMode: effectiveRequestedMode,
        attachments: effectiveAttachments,
        ...(capturedTemplateCore ? { templateCoreContent: capturedTemplateCore } : {}),
        ...(coreAnalysis ? { analysisOverride: coreAnalysis } : {}),
        ...(corePlan ? { planOverride: corePlan } : {}),
        ...(coreSafety ? { safetyOverride: coreSafety } : {}),
        ...(Object.keys(permissionOverrideMap).length > 0 ? { permissionOverrideMap } : {}),
        stylePreferences: mergedStyleForSession,
        ...(routerDecisionForSession ? { routerDecision: routerDecisionForSession } : {}),
        ...(lightMemoryHits.length > 0 ? { lightMemoryHits } : {}),
        submitUserLine: p0
      });
      window.setTimeout(() => flushWorkbenchUiPersist(), 0);
      } finally {
        chatSubmitFlightRef.current = false;
        setChatSubmitInFlight(false);
      }
    },
    [
      session,
      flushWorkbenchUiPersist,
      u.workbench.busySubmitNotice,
      u.workbench.trustL1MemoryHint,
      u.workbench.trustL2Cancel,
      u.workbench.trustL2Continue,
      u.workbench.trustL2Message,
      u.workbench.trustBlocked,
      flashTrustL1Hint,
      trustConfirmL2,
      templateLib,
      u.workbench.dataSafetyAttachmentsOmitted,
      replayMode,
      historyReadonlyPreview,
      savedResultReadonlyPreview,
      automationReadonlyPreview,
      stopWorkflowChain
    ]
  );

  const startWorkflowChain = useCallback(() => {
    if (session.isBusy || chatSubmitInFlight) return;
    if (session.status !== "success") return;
    if (!isWorkflowChainAllowed(session.lastTaskAnalysis, session.resolvedMode, session.currentResult)) return;
    const next = pickFirstNextSuggestion(session.currentResult?.metadata ?? null);
    if (!next) return;
    const fp = completionFingerprint(session.currentTaskId, session.lastCoreResultRunId);
    chainModeRef.current = true;
    chainAutoRemainingRef.current = WORKFLOW_CHAIN_MAX_AUTO_STEPS_V1 - 1;
    chainLastHandledFingerprintRef.current = fp;
    setChainModeUi(true);
    void handleChatSubmit({
      prompt: next,
      submitUserLine: next,
      skipIntentPreview: true,
      workflowChainAuto: true
    });
  }, [
    session.isBusy,
    chatSubmitInFlight,
    session.status,
    session.lastTaskAnalysis,
    session.resolvedMode,
    session.currentResult,
    session.currentTaskId,
    session.lastCoreResultRunId,
    handleChatSubmit
  ]);

  useEffect(() => {
    if (!chainModeRef.current) return;
    if (session.isBusy) return;
    if (session.status !== "success") return;
    if (!isWorkflowChainAllowed(session.lastTaskAnalysis, session.resolvedMode, session.currentResult)) {
      stopWorkflowChain();
      return;
    }
    const rem = chainAutoRemainingRef.current;
    if (rem <= 0) {
      stopWorkflowChain();
      return;
    }
    const fp = completionFingerprint(session.currentTaskId, session.lastCoreResultRunId);
    if (fp === chainLastHandledFingerprintRef.current) return;
    const suggestion = pickFirstNextSuggestion(session.currentResult?.metadata ?? null);
    if (!suggestion) {
      stopWorkflowChain();
      return;
    }
    chainLastHandledFingerprintRef.current = fp;
    chainAutoRemainingRef.current = rem - 1;
    void handleChatSubmit({
      prompt: suggestion,
      submitUserLine: suggestion,
      skipIntentPreview: true,
      workflowChainAuto: true
    });
  }, [
    session.status,
    session.isBusy,
    session.currentTaskId,
    session.lastCoreResultRunId,
    session.currentResult,
    session.resolvedMode,
    session.lastTaskAnalysis,
    handleChatSubmit,
    stopWorkflowChain
  ]);

  useEffect(() => {
    if (session.status === "error" && chainModeRef.current) stopWorkflowChain();
  }, [session.status, stopWorkflowChain]);

  useEffect(() => {
    if (session.status === "idle" && chainModeUi) stopWorkflowChain();
  }, [session.status, chainModeUi, stopWorkflowChain]);

  const onTaskClarificationConfirm = useCallback(
    (answers: Record<string, string>) => {
      setTaskClarification((cur) => {
        if (!cur) return null;
        const nextPayload = mergeClarificationIntoSubmit(
          cur.basePrompt,
          cur.questions,
          answers,
          cur.payload
        );
        queueMicrotask(() => void handleChatSubmit({ ...nextPayload, skipIntentPreview: true }));
        return null;
      });
    },
    [handleChatSubmit]
  );

  const onTaskClarificationCancel = useCallback(() => setTaskClarification(null), []);

  useEffect(
    () => () => {
      if (coreChannelNoticeTimerRef.current != null) {
        window.clearTimeout(coreChannelNoticeTimerRef.current);
      }
      if (trustHintTimerRef.current != null) {
        window.clearTimeout(trustHintTimerRef.current);
      }
    },
    []
  );

  /** ?q= + ?fromAutomationId=：从自动化草案手动载入提示词（非只读预览，不自动提交） */
  /** ?q= alone：仅预填。须与 fromAutomationId 合并处理顺序，避免双 effect 重复写 prompt */
  useEffect(() => {
    const fromAid = searchParams.get("fromAutomationId")?.trim();
    const q = searchParams.get("q")?.trim();
    if (fromAid && q) {
      setAutomationReadonlyPreview(null);
      setHistoryReadonlyPreview(null);
      setSavedResultReadonlyPreview(null);
      setHistoryReplayTask(null);
      setReplayMode(false);
      setReplayFreeze(null);
      setPrompt(q);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("q");
          next.delete("fromAutomationId");
          return next;
        },
        { replace: true }
      );
      setAutomationDraftLoadHint(u.workbench.automationDraftLoadedHint);
      return;
    }
    if (!q) return;
    setPrompt(q);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("q");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams, u.workbench.automationDraftLoadedHint]);

  /** J-1+：?runId= historyId — 拉取历史行与可选 execution 详情，只读恢复，不自动执行 */
  useEffect(() => {
    const rid = searchParams.get("runId")?.trim();
    if (!rid) return;
    setSavedResultReadonlyPreview(null);
    setAutomationReadonlyPreview(null);
    let cancelled = false;
    void (async () => {
      try {
        const rec = await fetchHistoryRecord(rid);
        if (cancelled || !rec) return;
        const exId = (rec.executionTaskId || "").trim();
        const applyPreviewOnly = () => {
          const { resultSource } = deriveHistoryListProvenance(rec.status, rec.mode);
          const st: ExecutionStatus =
            rec.status === "error" ? "error" : rec.status === "stopped" ? "stopped" : "success";
          const unifiedResult: TaskResult = {
            kind: "content",
            title: rec.prompt.slice(0, 120),
            body: (rec.preview || rec.prompt || "").trim(),
            resultSource
          };
          setHistoryReplayTask(null);
          setReplayMode(false);
          setReplayFreeze(null);
          setHistoryReadonlyPreview({ prompt: rec.prompt, status: st, unifiedResult });
        };
        if (exId) {
          try {
            const detail = await executionApi.fetchExecutionTaskDetail(exId);
            if (cancelled) return;
            setHistoryReadonlyPreview(null);
            setHistoryReplayTask(detail.task);
            setReplayFreeze({ logs: detail.logs ?? [], steps: detail.steps ?? [] });
            setReplaySerial((s) => s + 1);
            setReplayMode(true);
          } catch {
            if (!cancelled) applyPreviewOnly();
          }
        } else if (!cancelled) {
          applyPreviewOnly();
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete("runId");
              return next;
            },
            { replace: true }
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  /** Saved Results：?savedId= 本地资产只读打开（不自动执行） */
  useEffect(() => {
    const sid = searchParams.get("savedId")?.trim();
    if (!sid) return;
    const rec = getSavedResult(sid);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("savedId");
        return next;
      },
      { replace: true }
    );
    if (!rec) return;
    setHistoryReadonlyPreview(null);
    setHistoryReplayTask(null);
    setReplayMode(false);
    setReplayFreeze(null);
    setPrompt(rec.prompt);
    setSavedResultReadonlyPreview(rec);
    setAutomationReadonlyPreview(null);
  }, [searchParams, setSearchParams]);

  /** Automation Console：?automationId= 本地编排草案（不自动执行） */
  useEffect(() => {
    const aid = searchParams.get("automationId")?.trim();
    if (!aid) return;
    const rec = getAutomationRecord(aid);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("automationId");
        return next;
      },
      { replace: true }
    );
    if (!rec) return;
    setHistoryReadonlyPreview(null);
    setSavedResultReadonlyPreview(null);
    setHistoryReplayTask(null);
    setReplayMode(false);
    setReplayFreeze(null);
    setPrompt(rec.prompt ?? "");
    setAutomationReadonlyPreview(rec);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!automationDraftLoadHint) return;
    if (automationHintTimerRef.current != null) window.clearTimeout(automationHintTimerRef.current);
    automationHintTimerRef.current = window.setTimeout(() => {
      setAutomationDraftLoadHint(null);
      automationHintTimerRef.current = null;
    }, 6800);
    return () => {
      if (automationHintTimerRef.current != null) {
        window.clearTimeout(automationHintTimerRef.current);
        automationHintTimerRef.current = null;
      }
    };
  }, [automationDraftLoadHint]);

  /** 切换会话任务时退出「本地」回放；若正展示自历史恢复的只读详情则不清（由提交或退出回放清理） */
  useEffect(() => {
    if (historyReplayTask != null) return;
    setReplayMode(false);
    setReplayFreeze(null);
  }, [session.currentTaskId, historyReplayTask]);

  useEffect(() => {
    scheduleWorkbenchDraftPersist(prompt);
  }, [prompt]);

  /** D-7-5T：turns / 草稿 / live 指针 / session 切面 — 防抖写入（session 随 initFromTask 补齐后再落盘） */
  useEffect(() => {
    scheduleWorkbenchUiPersist();
  }, [
    workbenchTurns,
    liveTurnId,
    prompt,
    session.currentTaskId,
    session.lastPrompt,
    session.status,
    scheduleWorkbenchUiPersist,
    appliedTemplate,
    runSeedTemplateId
  ]);

  /** D-7-5T：进行中 live turn 与 session.status 对齐，便于落盘与恢复 */
  useEffect(() => {
    const lid = liveTurnId;
    if (!lid) return;
    setWorkbenchTurns((prev) => {
      const idx = prev.findIndex((t) => t.id === lid);
      if (idx < 0) return prev;
      if (prev[idx].frozen) return prev;
      const t = prev[idx];
      if (t.prompt.trim() !== session.lastPrompt.trim()) return prev;
      if (t.status === session.status) return prev;
      const now = new Date().toISOString();
      const next = [...prev];
      next[idx] = { ...t, status: session.status, updatedAt: now };
      workbenchTurnsRef.current = next;
      return next;
    });
  }, [liveTurnId, session.status]);

  /** Controller v1：进行中 turn 的 Controller 步骤与会话状态对齐（仅展示，不替代 Trust/Safety） */
  useEffect(() => {
    if (!liveTurnId) return;
    setWorkbenchTurns((prev) => {
      const idx = prev.findIndex((t) => t.id === liveTurnId);
      if (idx < 0) return prev;
      const t = prev[idx];
      if (t.frozen || !t.controllerPlan) return prev;
      /** 避免上一轮终态会话（如 success）与新 turn 错配导致步骤假「全完成」 */
      if (t.prompt.trim() !== session.lastPrompt.trim()) return prev;
      const execN = session.executionPlan?.steps?.length ?? 0;
      const synced = syncControllerStepsWithSession(t.controllerPlan, session.status, {
        phase: session.phase,
        currentStepIndex: session.currentStepIndex,
        executionPlanStepCount: execN
      });
      const prevSig = t.controllerPlan.steps.map((s) => s.status).join("|");
      const nextSig = synced.steps.map((s) => s.status).join("|");
      if (prevSig === nextSig) return prev;
      const now = new Date().toISOString();
      const next = [...prev];
      next[idx] = { ...t, controllerPlan: synced, updatedAt: now };
      workbenchTurnsRef.current = next;
      return next;
    });
  }, [
    liveTurnId,
    session.status,
    session.phase,
    session.currentStepIndex,
    session.executionPlan?.steps.length
  ]);

  /** D-7-5T：终态后将当轮 session 快照冻结到对应 turn，与 prompt 永久绑定展示 */
  useEffect(() => {
    if (!liveTurnId) return;
    if (!isExecutionTerminal(session.status)) return;
    setWorkbenchTurns((prev) => {
      const idx = prev.findIndex((t) => t.id === liveTurnId);
      if (idx < 0) return prev;
      if (prev[idx].frozen) return prev;
      const frozen = buildFrozenSnapshot(
        session.status,
        session.lastErrorMessage,
        es.error ?? undefined,
        session.currentResult
      );
      const now = new Date().toISOString();
      const err =
        frozen.errorMessage?.trim() ||
        (session.status === "error" ? (es.error ?? "").trim() || undefined : undefined);
      const next = [...prev];
      const row = next[idx];
      const executionSource = {
        usedTemplate: Boolean(runSeedTemplateId?.trim()),
        usedMemory: appliedWorkbenchMemoryLabels.length > 0,
        usedLocalRuntime: session.resolvedMode === "computer"
      };
      next[idx] = {
        ...row,
        status: session.status,
        updatedAt: now,
        error: err,
        resultTitle: frozen.resultKind ? frozen.resultTitle : undefined,
        resultBody: frozen.resultKind ? frozen.resultBody : undefined,
        resultKind: frozen.resultKind,
        frozen,
        executionSource
      };
      workbenchTurnsRef.current = next;
      return next;
    });
  }, [
    liveTurnId,
    session.status,
    session.lastErrorMessage,
    session.currentResult,
    session.resolvedMode,
    es.error,
    runSeedTemplateId,
    appliedWorkbenchMemoryLabels
  ]);

  /** E-3：/workbench?templateId= 仅自 Core GET /templates/:id 引导；本地库不作主源 */
  useEffect(() => {
    const tid = searchParams.get("templateId")?.trim();
    if (!tid) {
      setTemplateFromUrlError(null);
      setTemplateFromUrlLoading(false);
      return;
    }
    if (session.status !== "idle") return;

    let cancelled = false;
    setTemplateFromUrlLoading(true);
    setTemplateFromUrlError(null);

    const stripParam = () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("templateId");
          return next;
        },
        { replace: true }
      );

    void fetchTemplateById(tid)
      .then((detail) => {
        if (cancelled) return;
        setTemplateFromUrlLoading(false);
        const normalized = normalizeTemplateCoreContent(
          detail.content,
          typeof detail.workflowType === "string" ? detail.workflowType : undefined
        );
        if (!normalized.sourcePrompt.trim()) {
          setTemplateFromUrlError(u.workbench.templateLoadInvalidContent);
          stripParam();
          return;
        }
        stripParam();
        if (normalized.variables?.length) {
          pendingCoreForRunFormRef.current = normalized;
          const nowIso = new Date().toISOString();
          const top = readTemplateDetailTopFields(detail);
          templateFormalMetaRef.current = {
            product: top.product,
            market: top.market,
            locale: top.locale,
            workflowType: top.workflowType,
            version: top.version,
            audience: top.audience
          };
          const runTpl: Template = {
            id: tid,
            name: detail.title,
            description: typeof detail.description === "string" ? detail.description : "",
            product: top.product,
            market: top.market,
            locale: top.locale,
            version: top.version,
            audience: top.audience,
            workflowType: typeof detail.workflowType === "string" ? detail.workflowType : top.workflowType || undefined,
            sourceTaskId: typeof detail.sourceTaskId === "string" ? detail.sourceTaskId : "",
            sourceRunId: typeof detail.sourceResultId === "string" ? detail.sourceResultId : undefined,
            sourceResultKind:
              normalized.sourceResultKind === "content" || normalized.sourceResultKind === "computer"
                ? normalized.sourceResultKind
                : "none",
            sourcePrompt: normalized.sourcePrompt,
            createdAt: typeof detail.createdAt === "string" ? detail.createdAt : nowIso,
            lastUsedAt: typeof detail.updatedAt === "string" ? detail.updatedAt : nowIso,
            stepsSnapshot: normalized.stepsSnapshot,
            resultSnapshot: coerceResultSnapshot(normalized.resultSnapshot),
            variables: normalized.variables
          };
          setRunFormTemplate(runTpl);
          return;
        }
        setPrompt(normalized.sourcePrompt);
        setAppliedTemplate({ templateId: tid, displayName: detail.title });
        const top = readTemplateDetailTopFields(detail);
        templateFormalMetaRef.current = {
          product: top.product,
          market: top.market,
          locale: top.locale,
          workflowType: top.workflowType,
          version: top.version,
          audience: top.audience
        };
        bumpTemplateUseCount(tid);
        templateCoreContentRef.current = normalized;
        setTemplateBootstrap({ key: Date.now(), mode: normalized.requestedMode });
        schedulePersistHotState({ activeMode: normalized.requestedMode });
      })
      .catch((e) => {
        if (cancelled) return;
        setTemplateFromUrlLoading(false);
        const detail = e instanceof Error ? e.message.trim() : "";
        setTemplateFromUrlError(
          detail ? `${u.workbench.templateLoadFailed}（${detail}）` : u.workbench.templateLoadFailed
        );
      });

    return () => {
      cancelled = true;
    };
  }, [session.status, searchParams, setSearchParams, u.workbench.templateLoadFailed, u.workbench.templateLoadInvalidContent]);

  const dismissTemplateUrlError = useCallback(() => {
    setTemplateFromUrlError(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("templateId");
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  useEffect(() => {
    schedulePersistHotState({ selectedTaskId: session.currentTaskId });
  }, [session.currentTaskId]);

  useEffect(() => {
    if (!userId) return;
    schedulePersistHotState({ lastOpenedWorkspace: userId });
  }, [userId]);

  /** 热恢复 / initFromTask：尚无 turn 时补一条，避免主区空白（用户已删空则不补种） */
  useEffect(() => {
    if (workbenchUserEmptiedRef.current) return;
    if (workbenchTurns.length > 0) return;
    const p = session.lastPrompt.trim();
    if (!p) return;
    const id = session.currentTaskId.trim()
      ? `seed:${session.currentTaskId}`
      : `seed:${Date.now()}`;
    const createdAt = new Date().toISOString();
    liveTurnIdRef.current = id;
    setLiveTurnId(id);
    setWorkbenchTurns([
      {
        id,
        prompt: p,
        createdAt,
        updatedAt: createdAt,
        status: session.status === "idle" ? "pending" : session.status,
        frozen: null
      }
    ]);
  }, [session.lastPrompt, session.currentTaskId, session.status, workbenchTurns.length]);

  const removeWorkbenchTurn = useCallback(
    (id: string) => {
      setEditingTurnId((cur) => (cur === id ? null : cur));
      const isLive = liveTurnIdRef.current === id;
      if (isLive && sessionRef.current.isBusy) {
        sessionRef.current.emergencyStop();
      }
      setWorkbenchTurns((prev) => {
        const next = prev.filter((t) => t.id !== id);
        workbenchTurnsRef.current = next;
        if (next.length === 0) workbenchUserEmptiedRef.current = true;
        return next;
      });
      if (isLive) {
        liveTurnIdRef.current = null;
        setLiveTurnId(null);
        window.setTimeout(() => {
          sessionRef.current.clear();
        }, 0);
      }
      window.setTimeout(() => flushWorkbenchUiPersist(), 0);
    },
    [flushWorkbenchUiPersist]
  );

  const copyWorkbenchTurnPrompt = useCallback(async (turn: WorkbenchUiTurn) => {
    const text = turn.prompt.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const beginEditWorkbenchTurn = useCallback((turn: WorkbenchUiTurn) => {
    setPrompt(turn.prompt);
    setEditingTurnId(turn.id);
  }, []);

  const fillPromptFromQuickAccess = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setPendingIntentPreview(null);
    setEditingTurnId(null);
    setHistoryReplayTask(null);
    setHistoryReadonlyPreview(null);
    setSavedResultReadonlyPreview(null);
    setAutomationReadonlyPreview(null);
    setReplayMode(false);
    setReplayFreeze(null);
    setPrompt(t);
    promptRef.current = t;
    queueMicrotask(() => {
      const el = document.getElementById("workbench-chat-input") as HTMLTextAreaElement | null;
      if (!el || el.disabled) return;
      el.focus();
      try {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const beginReplay = useCallback(() => {
    setReplayFreeze({ logs: [...es.logs], steps: [...es.steps] });
    setReplaySerial((s) => s + 1);
    setReplayMode(true);
  }, [es.logs, es.steps]);

  const endReplay = useCallback(() => {
    setReplayMode(false);
    setReplayFreeze(null);
    setHistoryReplayTask(null);
    setHistoryReadonlyPreview(null);
    setSavedResultReadonlyPreview(null);
    setAutomationReadonlyPreview(null);
  }, []);

  const replayEnabled = replayMode && replayFreeze != null;
  const replay = useExecutionReplay(
    replayEnabled ? replayFreeze.logs : REPLAY_EMPTY_LOGS,
    replayEnabled ? replayFreeze.steps : REPLAY_EMPTY_STEPS,
    replayEnabled,
    { resetKey: `${historyReplayTask?.id ?? session.currentTaskId}:${replaySerial}` }
  );

  /** D-7-6K：任意依赖变化即滚到底（含新 turn、live 结果膨胀、流式 logs/steps、回放进度） */
  const timelineScrollAnchor = useMemo(() => {
    const r = session.currentResult;
    const rGrowth =
      r == null
        ? "0"
        : r.kind === "content"
          ? `c:${r.body?.length ?? 0}:${r.title?.length ?? 0}`
          : `p:${(r.body ?? r.summary ?? "").length}`;
    const turnSig = workbenchTurns
      .map((t) => `${t.id}:${t.status}:${t.updatedAt}:${t.frozen ? 1 : 0}`)
      .join(",");
    return [
      turnSig,
      liveTurnId ?? "",
      session.status,
      session.phase ?? "",
      session.lastErrorMessage,
      session.currentTaskId ?? "",
      session.currentStepIndex,
      rGrowth,
      es.logs.length,
      es.steps.length,
      es.error ?? "",
      es.result,
      replayMode,
      replay.progress,
      replay.replayLogs.length
    ].join("|");
  }, [
    workbenchTurns,
    liveTurnId,
    session.status,
    session.phase,
    session.lastErrorMessage,
    session.currentTaskId,
    session.currentStepIndex,
    session.currentResult,
    es.logs.length,
    es.steps.length,
    es.error,
    es.result,
    replayMode,
    replay.progress,
    replay.replayLogs.length
  ]);

  useLayoutEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const pin = () => {
      el.scrollTop = el.scrollHeight;
    };
    pin();
    const id = window.requestAnimationFrame(pin);
    return () => window.cancelAnimationFrame(id);
  }, [timelineScrollAnchor]);

  const showEmergencyStop = !replayMode && EMERGENCY_STOP_ACTIVE.has(session.status);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (replayMode) return;
      const s = sessionRef.current;
      if (!EMERGENCY_STOP_ACTIVE.has(s.status)) return;

      if (e.key === "Escape") {
        const ctrlChord = e.ctrlKey && !e.metaKey;
        if (!ctrlChord && (e.shiftKey || e.metaKey)) return;
        e.preventDefault();
        s.emergencyStop();
        return;
      }

      if (e.ctrlKey && e.shiftKey && !e.metaKey && (e.key === "." || e.code === "Period")) {
        e.preventDefault();
        s.emergencyStop();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [replayMode]);

  /* D-7-5P：终态 success/error/stopped 保留展示，但 isBusy 为 false，输入可继续发下一条 */
  /* D-7-6F：chatSubmitInFlight 覆盖 Core 前置 async 段，与 isBusy 一并门控 */
  const executionGateBusy = session.isBusy || chatSubmitInFlight;
  const composerLocked = executionGateBusy || replayMode;
  const submitDisabled = !prompt.trim() || executionGateBusy || replayMode;

  const workflowChainPanel = useMemo(() => {
    if (
      replayMode ||
      historyReadonlyPreview ||
      savedResultReadonlyPreview ||
      automationReadonlyPreview
    ) {
      return null;
    }
    const xr = u.console.executionResult;
    if (chainModeUi) {
      return {
        showStop: true,
        showStart: false,
        startDisabled: false,
        startLabel: xr.chainRunContinuous,
        stopLabel: xr.chainStopContinuous,
        onStart: () => {},
        onStop: stopWorkflowChain
      };
    }
    const allowed = isWorkflowChainAllowed(
      session.lastTaskAnalysis,
      session.resolvedMode,
      session.currentResult
    );
    const hasSug =
      session.status === "success" &&
      Boolean(pickFirstNextSuggestion(session.currentResult?.metadata ?? null));
    if (!allowed || !hasSug) return null;
    return {
      showStop: false,
      showStart: true,
      startDisabled: executionGateBusy,
      startLabel: xr.chainRunContinuous,
      stopLabel: xr.chainStopContinuous,
      onStart: startWorkflowChain,
      onStop: stopWorkflowChain
    };
  }, [
    replayMode,
    historyReadonlyPreview,
    savedResultReadonlyPreview,
    automationReadonlyPreview,
    chainModeUi,
    u.console.executionResult,
    session.lastTaskAnalysis,
    session.resolvedMode,
    session.currentResult,
    session.status,
    executionGateBusy,
    stopWorkflowChain,
    startWorkflowChain
  ]);

  const isTerminal =
    session.status === "success" || session.status === "error" || session.status === "stopped";
  const hasReplayData = es.logs.length > 0 || es.steps.length > 0;
  const canReplay =
    Boolean(session.currentTaskId) && isTerminal && hasReplayData && !replayMode && !historyReplayTask;

  const showTimelineEmpty = workbenchTurns.length === 0;

  const timelineTaskVm = useMemo(
    () =>
      historyReplayTask
        ? mapExecutionTaskToTaskVM(historyReplayTask)
        : mapWorkbenchTimelineToTaskVM({
            taskId: session.currentTaskId,
            prompt: session.lastPrompt,
            status: session.status
          }),
    [historyReplayTask, session.currentTaskId, session.lastPrompt, session.status]
  );

  const replayPanelLastPrompt = (historyReplayTask?.prompt ?? session.lastPrompt).trim();

  const liveActivityFingerprint = useMemo(() => {
    const r = session.currentResult;
    const rKey = r ? `${r.kind}` : "none";
    return [
      es.logs.length,
      es.steps.length,
      session.currentStepIndex,
      session.currentTaskId ?? "",
      session.status,
      rKey,
      es.error ?? ""
    ].join("|");
  }, [
    es.logs.length,
    es.steps.length,
    session.currentStepIndex,
    session.currentTaskId,
    session.status,
    session.currentResult,
    es.error
  ]);

  const simplifiedProgressHints = useWorkbenchExecutionStallHints(
    replayMode ? "idle" : session.status,
    replayMode ? `replay:${replaySerial}` : liveActivityFingerprint
  );

  const replayToolbar =
    canReplay && (
      <div className="execution-replay-toolbar">
        <button
          type="button"
          className="ui-btn ui-btn--secondary execution-replay-toolbar__btn"
          onClick={beginReplay}
        >
          回放
        </button>
      </div>
    );

  const activeStep =
    session.executionPlan &&
    session.currentStepIndex >= 0 &&
    session.currentStepIndex < session.executionPlan.steps.length
      ? session.executionPlan.steps[session.currentStepIndex]
      : null;
  const humanConfirmBanner =
    session.status === "running" &&
    activeStep?.type === "human_confirm" &&
    activeStep.status === "waiting_confirm" ? (
      <div className="human-step-confirm" role="region" aria-label="人工确认步骤">
        <h3 className="human-step-confirm__title">{activeStep.title ?? "等待确认"}</h3>
        {(activeStep.humanMessage ?? activeStep.description) ? (
          <p className="human-step-confirm__message">{activeStep.humanMessage ?? activeStep.description}</p>
        ) : null}
        <p className="human-step-confirm__hint">当前为流水线中的正式「待确认」步骤；确认后继续，拒绝则终止后续步骤。</p>
        <div className="human-step-confirm__actions">
          <button type="button" className="human-step-confirm__btn" onClick={() => session.confirmCurrentStep()}>
            {activeStep.metadata && isPermissionGrantStepMetadata(activeStep.metadata) ? "确认并继续" : "确认继续"}
          </button>
          <button
            type="button"
            className="human-step-confirm__btn human-step-confirm__btn--secondary"
            onClick={() => session.rejectCurrentStep()}
          >
            拒绝并停止
          </button>
        </div>
      </div>
    ) : null;

  const historyReplayUnified =
    historyReplayTask && historyReplayTask.result != null ? toTaskResult(historyReplayTask.result) : null;

  const beginNewTaskFromAutomationPreview = useCallback(() => {
    const p = automationReadonlyPreview?.prompt?.trim() ?? "";
    if (!p) return;
    setAutomationReadonlyPreview(null);
    setPrompt(p);
    setAutomationDraftLoadHint(u.workbench.automationDraftLoadedHint);
  }, [automationReadonlyPreview, u.workbench.automationDraftLoadedHint]);

  const handleSaveAsAutomation = useCallback(() => {
    if (session.status !== "success" || session.currentResult == null) return;
    const rec = createAutomationFromWorkbenchResult({
      prompt: session.lastPrompt,
      runId: session.lastCoreResultRunId,
      executionSteps: session.executionPlan?.steps ?? null
    });
    navigate(buildAutomationConsoleUrl(rec.id), { state: { automationToastShowView: true } });
  }, [
    session.status,
    session.currentResult,
    session.lastPrompt,
    session.lastCoreResultRunId,
    session.executionPlan,
    navigate
  ]);

  const liveWorkbenchTurn = useMemo(
    () => workbenchTurns.find((t) => t.id === liveTurnId) ?? null,
    [workbenchTurns, liveTurnId]
  );

  const executionSourceStrip = useMemo(() => {
    if (
      !liveTurnId ||
      replayMode ||
      historyReadonlyPreview ||
      savedResultReadonlyPreview ||
      automationReadonlyPreview
    ) {
      return null;
    }
    return {
      usedTemplate: Boolean(runSeedTemplateId?.trim()),
      usedMemory: appliedWorkbenchMemoryLabels.length > 0,
      usedLocalRuntime: session.resolvedMode === "computer"
    };
  }, [
    liveTurnId,
    replayMode,
    historyReadonlyPreview,
    savedResultReadonlyPreview,
    automationReadonlyPreview,
    runSeedTemplateId,
    appliedWorkbenchMemoryLabels.length,
    session.resolvedMode
  ]);

  const dataPostureRows = useMemo(
    () =>
      buildExecutionDataPostureRows(
        {
          resolvedMode: session.resolvedMode,
          loggedIn: Boolean(userId?.trim()),
          prefs: loadAppPreferences()
        },
        u.workbench.dataPosture
      ),
    [session.resolvedMode, userId, appPrefsRevision, u.workbench.dataPosture]
  );

  const controllerTimelineEl =
    liveWorkbenchTurn?.controllerPlan != null ? (
      <ControllerPlanTimeline
        plan={liveWorkbenchTurn.controllerPlan}
        alignment={liveWorkbenchTurn.coreControllerAlignment ?? null}
        routerDecision={liveWorkbenchTurn.routerDecision ?? session.lastRouterDecision ?? null}
      />
    ) : null;

  const workbenchRouterDecisionForResult =
    liveWorkbenchTurn?.routerDecision ?? session.lastRouterDecision ?? null;

  const resultAssetization = useMemo(() => {
    if (
      automationReadonlyPreview ||
      savedResultReadonlyPreview ||
      historyReadonlyPreview ||
      replayMode
    ) {
      return undefined;
    }
    if (session.status !== "success" || !session.currentResult) return undefined;
    const xr = u.console.executionResult;
    const fromTpl = Boolean(
      liveWorkbenchTurn?.controllerPlan?.templateProvenance || runSeedTemplateId?.trim()
    );
    const meta = session.currentResult.metadata as Record<string, unknown> | undefined;
    const seedParts: string[] = [];
    const tt = meta?.taskType;
    if (typeof tt === "string" && tt.trim()) seedParts.push(`taskType: ${tt.trim()}`);
    const st = meta?.structure;
    if (typeof st === "string" && st.trim()) seedParts.push(`structure: ${st.trim()}`);
    const descSeed = seedParts.join(" · ");
    const titleHint =
      session.currentResult.kind === "content" ? (session.currentResult.title || "").trim() : "";
    const tid = session.currentTaskId.trim();
    const rid = session.lastCoreResultRunId.trim();
    const starId = tid ? (rid ? `${tid}::${rid}` : `${tid}::local`) : "";
    const canRegen = Boolean(lastWorkbenchSubmitUserLineRef.current.trim() || session.lastPrompt.trim());

    return (
      <>
        {fromTpl ? (
          <p className="text-muted text-xs w-full mb-0 basis-full" role="note">
            {xr.templateBasedSaveVersionHint}
          </p>
        ) : null}
        <SaveAsTemplateButton
          sourceTaskId={session.currentTaskId}
          sourceRunId={session.lastCoreResultRunId || undefined}
          sourcePrompt={session.lastPrompt}
          streamSteps={es.steps}
          streamResult={session.currentResult ?? es.result}
          inferenceContext={templateSaveInferenceContext}
          saveTemplateFromTask={templateLib.saveTemplateFromTask}
          disabled={templateAlreadySavedForRun}
          initialNameOverride={titleHint || null}
          initialDescriptionSeed={descSeed || null}
          buttonClassName="ui-btn ui-btn--secondary"
          ctaLabel={xr.saveAsTemplateAsset}
        />
        <button
          type="button"
          className="ui-btn ui-btn--secondary"
          disabled={chatSubmitInFlight || session.isBusy || !canRegen}
          onClick={() => {
            const line = lastWorkbenchSubmitUserLineRef.current.trim() || session.lastPrompt.trim();
            void handleChatSubmit({ prompt: line, submitUserLine: line, skipIntentPreview: true });
          }}
        >
          {xr.regenerateAnother}
        </button>
        <ResultAssetStarButton
          storageId={starId}
          markLabel={xr.markImportant}
          markedLabel={xr.markedImportant}
          disabled={!starId}
        />
      </>
    );
  }, [
    automationReadonlyPreview,
    savedResultReadonlyPreview,
    historyReadonlyPreview,
    replayMode,
    session.status,
    session.currentResult,
    session.currentTaskId,
    session.lastCoreResultRunId,
    session.lastPrompt,
    session.isBusy,
    liveWorkbenchTurn?.controllerPlan?.templateProvenance,
    runSeedTemplateId,
    u.console.executionResult,
    templateSaveInferenceContext,
    templateLib,
    templateAlreadySavedForRun,
    es.steps,
    es.result,
    chatSubmitInFlight,
    handleChatSubmit
  ]);

  const resultArea =
    automationReadonlyPreview && !replayMode ? (
      <AutomationDraftPreviewPanel u={u} record={automationReadonlyPreview} />
    ) : savedResultReadonlyPreview && !replayMode ? (
      <ExecutionResultPanel
        status="success"
        phase={null}
        lastErrorMessage=""
        lastPrompt={savedResultReadonlyPreview.prompt}
        streamLogs={[]}
        streamResult={null}
        streamSteps={[]}
        streamError={null}
        unifiedResult={savedRecordToTaskResult(savedResultReadonlyPreview)}
        coreResultRunId={undefined}
        simplifiedPresentation
        showExecutionProvenance={showExecutionSourceAndSteps}
      />
    ) : historyReadonlyPreview && !replayMode ? (
      <ExecutionResultPanel
        status={historyReadonlyPreview.status}
        phase={null}
        lastErrorMessage=""
        lastPrompt={historyReadonlyPreview.prompt}
        streamLogs={[]}
        streamResult={null}
        streamSteps={[]}
        streamError={null}
        unifiedResult={historyReadonlyPreview.unifiedResult}
        coreResultRunId={undefined}
        simplifiedPresentation
        showExecutionProvenance={showExecutionSourceAndSteps}
      />
    ) : replayMode && replayFreeze ? (
      <ExecutionReplayPanel
        replayContextVm={timelineTaskVm}
        lastPrompt={replayPanelLastPrompt}
        replayLogs={replay.replayLogs}
        replaySteps={replay.replaySteps}
        progress={replay.progress}
        isPlaying={replay.isPlaying}
        play={replay.play}
        pause={replay.pause}
        seek={replay.seek}
        onExitReplay={endReplay}
        unifiedResult={historyReplayUnified ?? session.currentResult}
        stepResults={session.stepResults}
      />
    ) : (
      <ExecutionResultPanel
        status={session.status}
        phase={session.phase}
        lastErrorMessage={session.lastErrorMessage}
        authEscalation={session.lastAuthEscalation}
        lastPrompt={session.lastPrompt}
        streamLogs={es.logs}
        streamResult={es.result}
        streamSteps={es.steps}
        streamError={es.error}
        unifiedResult={session.currentResult}
        stepResults={session.stepResults}
        coreResultRunId={session.lastCoreResultRunId}
        simplifiedPresentation
        showExecutionProvenance={showExecutionSourceAndSteps}
        simplifiedProgressHints={simplifiedProgressHints}
        executionSourceStrip={executionSourceStrip}
        routerDecision={workbenchRouterDecisionForResult}
        onSaveAsAutomation={
          session.status === "success" && session.currentResult != null ? handleSaveAsAutomation : undefined
        }
        goalRefreshKey={goalUiTick}
        onSubmitSuggestedPrompt={(text) => {
          const t = text.trim();
          void handleChatSubmit({ prompt: t, submitUserLine: t, skipIntentPreview: true });
        }}
        resultAssetization={resultAssetization}
        workflowChain={workflowChainPanel}
      />
    );

  const workbenchStopBar =
    showEmergencyStop ? (
      <div className="workbench-conversation__stop-row">
        <button
          type="button"
          className="ui-btn ui-btn--secondary workbench-conversation__stop"
          onClick={() => session.emergencyStop()}
        >
          停止
        </button>
      </div>
    ) : null;

  const hasExecutionPlanSteps = Boolean(session.executionPlan?.steps.length);
  const showStepsPanel = hasExecutionPlanSteps && showExecutionSourceAndSteps;
  const capSpecTop = session.lastTaskAnalysis?.metadata?.contentCapability;
  const showCapabilityTopBanner = Boolean(
    session.lastTaskAnalysis?.intent === "content_capability" &&
      capSpecTop &&
      session.executionPlan?.steps.some((s) => s.type === "capability")
  );
  const capabilityTopBannerCopy =
    showCapabilityTopBanner && capSpecTop ? getContentCapabilityBannerCopy(capSpecTop) : null;

  const capabilityTopBanner = capabilityTopBannerCopy ? (
    <div className="workbench-capability-banner" role="region" aria-label="能力执行模式">
      <div className="workbench-capability-banner__badge">{capabilityTopBannerCopy.badge}</div>
      <h3 className="workbench-capability-banner__headline">{capabilityTopBannerCopy.headline}</h3>
      <p className="workbench-capability-banner__detail">{capabilityTopBannerCopy.detail}</p>
      <p className="workbench-capability-banner__meta">
        <span className="workbench-capability-banner__meta-k">能力类型（capabilityType）</span>
        {capabilityTopBannerCopy.typeLine}
      </p>
      <p className="workbench-capability-banner__meta">
        <span className="workbench-capability-banner__meta-k">操作（operation）</span>
        {capabilityTopBannerCopy.operationLine}
      </p>
      <div className="workbench-capability-banner__actions">
        <button
          type="button"
          className="ui-btn ui-btn--secondary"
          onClick={() => session.rerunAsNormalContent()}
          disabled={!session.lastPrompt.trim() || chatSubmitInFlight}
        >
          不使用能力执行，按普通内容生成
        </button>
      </div>
    </div>
  ) : null;

  const dataPostureEl =
    showExecutionSourceAndSteps && dataPostureRows.length > 0 ? (
      <DataPostureStrip title={u.workbench.dataPosture.title} rows={dataPostureRows} />
    ) : null;

  const blockBody =
    session.resolvedMode === "computer" && !hasExecutionPlanSteps ? (
      <ComputerExecutionPanel
        prompt={session.lastPrompt}
        status={session.status}
        phase={session.phase}
        computerEvents={session.computerExecutionEvents ?? undefined}
        embedFooterOnly
      >
        {dataPostureEl}
        {controllerTimelineEl}
        {replayToolbar}
        {workbenchStopBar}
        {humanConfirmBanner}
        {resultArea}
      </ComputerExecutionPanel>
    ) : (
      <>
        {dataPostureEl}
        {controllerTimelineEl}
        {capabilityTopBanner}
        {showStepsPanel ? (
          <ExecutionPlanStepsPanel
            plan={session.executionPlan}
            currentStepIndex={session.currentStepIndex}
            stepResults={session.stepResults}
          />
        ) : null}
        {replayToolbar}
        {workbenchStopBar}
        {humanConfirmBanner}
        {resultArea}
      </>
    );

  return (
    <div className="workbench-shell">
      <div className="workbench-shell__main">
        <div className="workbench-console workbench-console--chat app-workbench app-workbench--minimal">
          <div className="workbench-chat">
            <ExecutionTimelineArea ref={timelineScrollRef}>
              {showTimelineEmpty ? (
                <div className="execution-timeline-empty">
                  <p className="execution-timeline-empty__title">{u.stage.emptyTimelineTitle}</p>
                  <p className="execution-timeline-empty__desc">{u.stage.emptyTimelineDesc}</p>
                </div>
              ) : (
                <div className="workbench-conversation">
                  {workbenchTurns.map((turn) => (
                    <div
                      key={turn.id}
                      className={`workbench-turn workbench-conversation__turn${editingTurnId === turn.id ? " workbench-turn--editing" : ""}`}
                    >
                      <div className="workbench-turn__user-block">
                        <div className="workbench-conversation__user-bubble">
                          <p className="workbench-conversation__user-text">
                            {turn.prompt.trim() || "（空任务）"}
                          </p>
                        </div>
                        <div className="workbench-turn__actions" role="toolbar" aria-label="此轮对话操作">
                          <button
                            type="button"
                            className="workbench-turn__action"
                            aria-label="复制此条输入"
                            title="复制"
                            onClick={() => void copyWorkbenchTurnPrompt(turn)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="workbench-turn__action"
                            aria-label="删除整条对话轮次（含结果与执行展示）"
                            title="删除"
                            onClick={() => removeWorkbenchTurn(turn.id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 6h18" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <path d="M10 11v6M14 11v6" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="workbench-turn__action"
                            aria-label="重新编辑：将内容填入输入框，发送后将作为新的一条轮次"
                            title="重新编辑"
                            onClick={() => beginEditWorkbenchTurn(turn)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {turnFrozenForDisplay(turn) ? (
                        <WorkbenchFrozenTurnBody turn={turn} />
                      ) : turn.id === liveTurnId ? (
                        <div className="workbench-conversation__assistant">{blockBody}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </ExecutionTimelineArea>

            {applyMemoryHintsInTasks && appliedWorkbenchMemoryLabels.length > 0 ? (
              <div
                className="workbench-memory-hints-bar text-sm"
                role="status"
                aria-label="本次任务应用的记忆提示"
              >
                <div className="workbench-memory-hints-bar__head">
                  <span className="workbench-memory-hints-bar__title">{u.workbench.memoryUsedThisRound}</span>
                </div>
                {appliedWorkbenchMemoryLabels.length > 0 ? (
                  <>
                    <span className="workbench-memory-hints-bar__subtitle">{u.workbench.memoryRoundDetailLabel}</span>
                    <ul className="workbench-memory-hints-bar__list">
                      {appliedWorkbenchMemoryLabels.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ) : null}
            {import.meta.env.DEV && coreChannelNotice ? (
              <div className="workbench-core-channel-notice workbench-core-channel-notice--dev-only text-sm" role="status">
                {coreChannelNotice}
              </div>
            ) : null}
            {busySubmitToast ? (
              <p className="workbench-busy-submit-toast" role="status" aria-live="polite">
                {busySubmitToast}
              </p>
            ) : null}
            {templateFromUrlLoading ? (
              <p className="workbench-template-url-status text-sm" role="status" aria-live="polite">
                {u.workbench.templateLoading}
              </p>
            ) : null}
            {templateFromUrlError ? (
              <div
                className="workbench-template-url-error text-sm"
                role="alert"
                style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 6, background: "var(--surface-elevated, #2a2a2a)" }}
              >
                <p style={{ margin: "0 0 8px" }}>{templateFromUrlError}</p>
                <button type="button" className="btn btn--secondary" onClick={dismissTemplateUrlError}>
                  {u.workbench.continueWithoutTemplate}
                </button>
              </div>
            ) : null}
            {trustInlineHint ? (
              <p className="workbench-trust-hint text-sm text-muted mb-2" role="status" aria-live="polite">
                {trustInlineHint}
              </p>
            ) : null}
            {savedResultReadonlyPreview ? (
              <div
                className="workbench-history-readonly-banner text-sm mb-2"
                role="status"
                style={{ padding: "8px 10px", borderRadius: 6, background: "var(--surface-elevated, #2a2a2a)" }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span>{u.workbench.viewingSavedResultBanner}</span>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={clearSavedResultReadonlyPreview}>
                    {u.workbench.dismissSavedResultView}
                  </button>
                  <Link className="btn btn--secondary btn--sm" to="/saved-results">
                    {u.workbench.openSavedResultsList}
                  </Link>
                </div>
              </div>
            ) : null}
            {automationReadonlyPreview ? (
              <div
                className="workbench-automation-draft-banner text-sm mb-2"
                role="status"
                style={{ padding: "8px 10px", borderRadius: 6, background: "var(--surface-elevated, #2a2a2a)" }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span className="font-medium">{u.workbench.viewingAutomationDraftBanner}</span>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={beginNewTaskFromAutomationPreview}
                    disabled={!automationReadonlyPreview.prompt?.trim()}
                  >
                    {u.workbench.startNewTaskFromAutomationDraft}
                  </button>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={clearAutomationReadonlyPreview}>
                    {u.workbench.dismissAutomationDraftView}
                  </button>
                  <Link className="btn btn--secondary btn--sm" to="/automation">
                    {u.workbench.openAutomationConsole}
                  </Link>
                </div>
              </div>
            ) : null}
            {automationDraftLoadHint ? (
              <p className="workbench-automation-loaded-hint text-sm text-muted mb-2" role="status">
                {automationDraftLoadHint}
              </p>
            ) : null}
            {showContentIntelPanel ? (
              <ContentIntelWorkbenchPanel
                prompt={prompt}
                onApplyToPrompt={(next) => setPrompt(next)}
                sessionStatus={session.status}
                resultTitle={session.currentResult?.title}
                resultBodyPreview={
                  session.currentResult?.kind === "content"
                    ? session.currentResult.body?.slice(0, 1500)
                    : (session.currentResult?.summary ?? "").slice(0, 1500)
                }
              />
            ) : null}
            {pendingIntentPreview && !replayMode ? (
              <div
                className="workbench-intent-preview-banner text-sm mb-3"
                role="region"
                aria-label="执行前预览"
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--radius-lg, 8px)",
                  border: "1px solid var(--border-default, rgba(255,255,255,0.12))",
                  background: "var(--surface-card, var(--bg-card))"
                }}
              >
                <div className="font-medium text-primary mb-1">系统理解为：</div>
                <p className="text-primary mb-1">
                  {formatIntentPreviewPrimaryLine(pendingIntentPreview.enrichedIntent)}
                </p>
                <p className="text-muted mb-3" style={{ fontSize: "0.8125rem" }}>
                  执行方式：{pendingIntentPreview.enrichedIntent.executionMode}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => {
                      const snap = pendingIntentPreview;
                      if (!snap) return;
                      setPendingIntentPreview(null);
                      void handleChatSubmit({ ...snap.payloadSnapshot, skipIntentPreview: true });
                    }}
                  >
                    执行
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => {
                      const snap = pendingIntentPreview;
                      if (!snap) return;
                      setPendingIntentPreview(null);
                      setPrompt(snap.originalInput);
                      promptRef.current = snap.originalInput;
                    }}
                  >
                    修改
                  </button>
                </div>
              </div>
            ) : null}
            <ChatInputBar
              prompt={prompt}
              setPrompt={setPrompt}
              locked={composerLocked}
              submitDisabled={submitDisabled}
              sessionBusy={executionGateBusy}
              conversationalInput
              initialTaskMode={workbenchInitialTaskMode}
              onTaskModeChange={(mode) => {
                schedulePersistHotState({ activeMode: mode });
                void writeModePreferenceToCore(mode);
              }}
              appliedTemplate={appliedTemplate}
              onClearAppliedTemplate={clearAppliedTemplateSource}
              templateBootstrap={templateBootstrap}
              showTemplateDetailLink={showTemplateDetailLink}
              onSubmit={handleChatSubmit}
            />
          </div>
        </div>

        {runFormTemplate ? (
          <TemplateRunForm
            template={runFormTemplate}
            onApply={handleRunFormApply}
            onCancel={handleRunFormCancel}
          />
        ) : null}
      </div>
      <aside className="workbench-shell__aside" aria-label={u.quickAccess.panelAria}>
        <QuickAccessPanel
          templates={quickAccessTemplates}
          onFillPrompt={fillPromptFromQuickAccess}
          onOpenTemplateInWorkbench={openTemplateFromQuickAccess}
        />
      </aside>
      <TaskClarificationPanel
        open={taskClarification != null}
        title={u.workbench.clarificationTitle}
        confirmLabel={u.workbench.clarificationConfirm}
        cancelLabel={u.workbench.clarificationCancel}
        questions={taskClarification?.questions ?? []}
        onConfirm={onTaskClarificationConfirm}
        onCancel={onTaskClarificationCancel}
      />
      <TrustL2ConfirmModal
        open={trustL2Open}
        message={u.workbench.trustL2Message}
        continueLabel={u.workbench.trustL2Continue}
        cancelLabel={u.workbench.trustL2Cancel}
        onContinue={onTrustL2Continue}
        onCancel={onTrustL2Cancel}
      />
    </div>
  );
};
