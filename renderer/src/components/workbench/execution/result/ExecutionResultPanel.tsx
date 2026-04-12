import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatHistoryOutputTrustForUi, formatHistoryResultSourceForUi } from "../../../../i18n/formatExecutionUi";
import { Link } from "react-router-dom";
import type { ExecutionPhase, ExecutionStatus } from "../../../../execution/session/execution";
import type { AuthEscalationKind } from "../../../../services/authEscalation";
import { adaptResult, adaptSteps } from "../../../../execution/session/adapters";
import { toResultCardView, toTaskResult } from "../../../../modules/result/resultAdapters";
import type { TaskResult } from "../../../../modules/result/resultTypes";
import { isMockPlaceholderTaskResult } from "../../../../modules/result/mockResultUi";
import {
  EXECUTION_RESULT_LEGACY_SOURCE_UNKNOWN_ZH,
  outputTrustHintZh,
  outputTrustSimplifiedSuccessLeadZh,
  resultSourceLabelZh
} from "../../../../modules/result/resultProvenanceUi";
import {
  buildDegradedSuccessBanner,
  buildFailureResultPresentation
} from "../../../../modules/result/failureResultPresentation";
import { resolveContentTrustPresentation } from "../../../../modules/result/resultSourcePolicy";
import type { CoreResultRecord } from "../../../../services/coreResultService";
import { getCoreResultByRunId } from "../../../../services/coreResultService";
import { hashResultContentAsync } from "../../../../services/contentHash";
import { mapTaskResultToResultVM } from "../../../../viewmodels";
import { useUiStrings } from "../../../../i18n/useUiStrings";
import { ExecutionStepStream } from "../../ExecutionStepStream";
import { ExecutionEmptyState } from "./ExecutionEmptyState";
import { ExecutionLogPreview } from "./ExecutionLogPreview";
import { getLastExportPathForDisplay } from "../../../../services/localRuntimeService";
import {
  copyResultPackageToClipboard,
  exportResultPackageFile,
  localRuntimeCanExportFullBody,
  resolveExportBodies,
  type ResultPackageBuildInput
} from "../../../../services/resultPackageExport";
import { saveSavedResult } from "../../../../modules/savedResults/savedResultsStore";
import type { OutputTrust, ResultSource } from "../../../../modules/result/resultTypes";
import { toUserFacingExecutionError } from "../../../../services/userFacingExecutionMessage";
import type { WorkbenchStallHints } from "../../../../hooks/useWorkbenchExecutionStallHints";
import {
  isWorkbenchLikelyNetworkError,
  isWorkbenchLikelyTimeoutError
} from "../../../../modules/workbench/workbenchErrorClassify";
import { WorkbenchSourceStrip } from "../../chat/WorkbenchSourceStrip";
import type { WorkbenchExecutionSourceV1 } from "../../../../services/workbenchUiPersistence";
import type { RouterDecision } from "../../../../modules/router/routerTypes";
import { readGoalProjectStore } from "../../../../modules/workbench/activeGoalStore";
import { SHORT_TASK_UI_SUPPRESS_MS } from "../../../../execution/session/useExecutionSession";

export type ExecutionResultPanelProps = {
  status: ExecutionStatus;
  phase: ExecutionPhase | null;
  lastErrorMessage: string;
  lastPrompt: string;
  /** 事件流：原始 logs / result / steps（经适配层消费） */
  streamLogs?: unknown[] | null;
  streamResult?: unknown | null;
  streamSteps?: unknown[] | null;
  /** 后端 lastErrorSummary（优先于 lastErrorMessage 展示） */
  streamError?: string | null;
  /** D-5-9：Session TaskResult，优先于 streamResult */
  unifiedResult?: TaskResult | null;
  /** D-5-10：各步产出预览（plan step.id → TaskResult） */
  stepResults?: Record<string, TaskResult> | null;
  /** D-4-1：成功态下的扩展操作区（如存为模板） */
  successActions?: ReactNode;
  /** D-7-3H：用于成功后后台拉 Core 覆盖展示 */
  coreResultRunId?: string;
  /** D-7-4F：需要登录 / 更高验证时结果区引导 */
  authEscalation?: AuthEscalationKind | null;
  /** D-7-5K：对话式工作台 — 简化进行中态、隐藏日志与工程向元数据 */
  simplifiedPresentation?: boolean;
  /** H-1：是否展示结果来源（F-3）等执行可信说明 */
  showExecutionProvenance?: boolean;
  /** D-7-6H：长运行 / 无活动阈值提示（仅 simplifiedPresentation 时生效） */
  simplifiedProgressHints?: WorkbenchStallHints | null;
  /** Automation Console v1：从当前成功结果保存编排草案 */
  onSaveAsAutomation?: () => void;
  /** Controller v1：模板 / 记忆 / 本地能力来源条（对话式工作台） */
  executionSourceStrip?: WorkbenchExecutionSourceV1 | null;
  /** AI Router v1：模型与执行位置（与来源条同区展示） */
  routerDecision?: RouterDecision | null;
  /** Next Task Suggestion v1：点击建议文案即发起同流程新任务 */
  onSubmitSuggestedPrompt?: (text: string) => void;
  /** Goal / Project v1：创建目标后刷新进度条展示 */
  goalRefreshKey?: number;
  /** Result Assetization v1：结果卡片内「保存为模板 / 再生成 / 标记」等（在下一步建议之下） */
  resultAssetization?: ReactNode;
  /** Workflow / Task Chain v1：连续执行 / 停止 */
  workflowChain?: {
    showStop: boolean;
    showStart: boolean;
    startDisabled?: boolean;
    startLabel: string;
    stopLabel: string;
    onStart: () => void;
    onStop: () => void;
  } | null;
  /** 首页统一入口：统一降级/失败文案，隐藏来源条与工程向元数据 */
  entryMinimalResultUi?: boolean;
  /** 简化进行中态（覆盖 validating / queued / running 默认文案） */
  runningStatusLine?: string | null;
};

const MOCK_DURATION_DISPLAY = "2.4s";
const MOCK_STEP_COUNT = 4;

function PreparingSkeleton() {
  return (
    <div className="execution-result-panel__preparing" aria-busy="true">
      <div className="execution-result-panel__skeleton execution-result-panel__skeleton--line" />
      <div className="execution-result-panel__skeleton execution-result-panel__skeleton--line execution-result-panel__skeleton--short" />
      <div className="execution-result-panel__skeleton execution-result-panel__skeleton--line execution-result-panel__skeleton--medium" />
    </div>
  );
}

function resolveErrorDetail(
  streamError: string | null | undefined,
  lastErrorMessage: string,
  fallback: string,
  userFacing: boolean
): string {
  const raw =
    streamError && streamError.trim()
      ? streamError.trim()
      : lastErrorMessage === "mock_failure"
        ? fallback
        : lastErrorMessage || fallback;
  return userFacing ? toUserFacingExecutionError(raw, streamError) : raw;
}

/**
 * 结果 / 日志反馈区：只读展示，不调用 start/stop/retry/clear（操作仅控制条）。
 */
export const ExecutionResultPanel = ({
  status,
  phase: _phase,
  lastErrorMessage,
  lastPrompt,
  streamLogs,
  streamResult,
  streamSteps,
  streamError,
  showExecutionProvenance = true,
  unifiedResult,
  stepResults,
  successActions,
  coreResultRunId,
  authEscalation = null,
  simplifiedPresentation = false,
  simplifiedProgressHints = null,
  onSaveAsAutomation,
  executionSourceStrip = null,
  routerDecision = null,
  onSubmitSuggestedPrompt,
  goalRefreshKey = 0,
  resultAssetization = null,
  workflowChain = null,
  entryMinimalResultUi = false,
  runningStatusLine = null
}: ExecutionResultPanelProps) => {
  const u = useUiStrings();
  const x = u.console.executionResult;
  const au = u.automation;
  const wt = u.workbench.turnStatus;
  void _phase;

  const progressHints = simplifiedProgressHints ?? { longRunning: false, stalled: false };

  const simplifiedProgressExtra =
    simplifiedPresentation && (progressHints.stalled || progressHints.longRunning) ? (
      progressHints.stalled ? (
        <p className="workbench-progress-hint workbench-progress-hint--warn text-sm mt-2 mb-0" role="note">
          {wt.stallHint}
        </p>
      ) : (
        <p className="workbench-progress-hint text-muted text-sm mt-2 mb-0" role="note">
          {wt.longRunningHint}
        </p>
      )
    ) : null;

  const [coreOverlay, setCoreOverlay] = useState<CoreResultRecord | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExportPath, setLastExportPath] = useState<string | null>(() => getLastExportPathForDisplay());
  const [successCompletedAt, setSuccessCompletedAt] = useState<string | null>(null);
  const [includeLocalFull, setIncludeLocalFull] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const copyNoticeTimerRef = useRef<number | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveNoticeTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  /** 首页极简：短于阈值不展示进行中态，避免「闪一下正在处理」 */
  const [showDelayedProgress, setShowDelayedProgress] = useState(false);

  useEffect(() => {
    setShowDelayedProgress(false);
    if (
      !entryMinimalResultUi ||
      (status !== "validating" && status !== "queued" && status !== "running")
    ) {
      return;
    }
    const id = window.setTimeout(() => setShowDelayedProgress(true), SHORT_TASK_UI_SUPPRESS_MS);
    return () => window.clearTimeout(id);
  }, [status, entryMinimalResultUi]);

  const showInFlightProgressUi =
    !entryMinimalResultUi ||
    showDelayedProgress ||
    status === "paused" ||
    status === "stopping";

  useEffect(() => {
    setCoreOverlay(null);
    const rid = coreResultRunId?.trim();
    if (status !== "success" || !rid) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await getCoreResultByRunId(rid);
        if (cancelled || !row?.result) return;
        if (row.hash && unifiedResult) {
          const localH = await hashResultContentAsync(lastPrompt, unifiedResult);
          if (localH === row.hash) {
            setCoreOverlay(null);
            return;
          }
          console.warn("local data mismatch, fallback to core");
        }
        setCoreOverlay(row);
        if (!row.hash) console.log("[D-7-3H] Core Result overlay", rid);
      } catch (err) {
        console.error("[D-7-3H] Core result fetch failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, coreResultRunId, unifiedResult, lastPrompt]);

  useEffect(() => {
    if (status === "idle" || status === "validating" || status === "queued" || status === "running") {
      setSuccessCompletedAt(null);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "success") {
      setIncludeLocalFull(false);
    }
  }, [status]);

  useEffect(
    () => () => {
      if (copyNoticeTimerRef.current != null) {
        window.clearTimeout(copyNoticeTimerRef.current);
      }
      if (saveNoticeTimerRef.current != null) {
        window.clearTimeout(saveNoticeTimerRef.current);
      }
    },
    []
  );

  const effectiveUnifiedResult = coreOverlay?.result ?? unifiedResult;
  const effectiveStepResults = coreOverlay?.stepResults ?? stepResults;

  const f3Content = effectiveUnifiedResult?.kind === "content" ? effectiveUnifiedResult : null;

  const failurePresentation = useMemo(
    () =>
      status === "error"
        ? buildFailureResultPresentation({
            streamError,
            lastErrorMessage,
            unifiedResult: effectiveUnifiedResult ?? undefined
          })
        : null,
    [status, streamError, lastErrorMessage, effectiveUnifiedResult]
  );

  const degradedBanner = useMemo(() => {
    if (status !== "success" || !f3Content) return null;
    return buildDegradedSuccessBanner({ resultSource: f3Content.resultSource });
  }, [status, f3Content]);
  const trustPresentation = f3Content ? resolveContentTrustPresentation(f3Content) : null;

  const resultCard = useMemo(() => {
    if (effectiveUnifiedResult) return toResultCardView(effectiveUnifiedResult);
    const fromStream = toTaskResult(streamResult ?? null);
    if (fromStream) return toResultCardView(fromStream);
    const legacy = adaptResult(streamResult ?? null);
    if (legacy) {
      return {
        title: legacy.title,
        body: legacy.body,
        stepCount: legacy.stepCount,
        durationLabel: legacy.durationLabel
      };
    }
    return null;
  }, [effectiveUnifiedResult, streamResult]);

  const displayResultVm = useMemo(() => {
    if (effectiveUnifiedResult) {
      return mapTaskResultToResultVM(effectiveUnifiedResult, {
        source: coreOverlay ? "core" : "local",
        hash: coreOverlay?.hash,
        hasCoreSync: Boolean(coreResultRunId?.trim())
      });
    }
    const fromStream = toTaskResult(streamResult ?? null);
    if (fromStream) {
      return mapTaskResultToResultVM(fromStream, {
        source: "stream",
        hasCoreSync: Boolean(coreResultRunId?.trim())
      });
    }
    const legacy = adaptResult(streamResult ?? null);
    if (legacy) {
      return {
        kind: "unknown" as const,
        title: legacy.title,
        body: legacy.body,
        summary: "",
        source: "stream-legacy",
        hasCoreSync: Boolean(coreResultRunId?.trim())
      };
    }
    return null;
  }, [effectiveUnifiedResult, streamResult, coreOverlay, coreResultRunId]);

  const hasRealResult = resultCard !== null || displayResultVm != null;

  useEffect(() => {
    if (status === "success" && hasRealResult) {
      setSuccessCompletedAt((prev) => prev ?? new Date().toISOString());
    }
  }, [status, hasRealResult]);

  const resultSourceLabel =
    displayResultVm?.source === "core" || coreOverlay ? "Core" : "本地";
  const adaptedSteps = useMemo(() => (Array.isArray(streamSteps) ? adaptSteps(streamSteps) : []), [streamSteps]);
  const stepsOverride = adaptedSteps.length > 0 ? adaptedSteps : null;

  const summaryStepCount = stepsOverride?.length ?? resultCard?.stepCount ?? MOCK_STEP_COUNT;
  const summaryDuration = resultCard?.durationLabel?.trim() || MOCK_DURATION_DISPLAY;

  const canIncludeLocalFull = localRuntimeCanExportFullBody(effectiveUnifiedResult ?? null);

  const resultSourceExportDisplay = useMemo(() => {
    if (!trustPresentation) return u.common.dash;
    if (trustPresentation.legacySourceUnknown) return EXECUTION_RESULT_LEGACY_SOURCE_UNKNOWN_ZH;
    const parts = trustPresentation.distinctSources.map((s) => formatHistoryResultSourceForUi(u, s));
    return parts.length ? parts.join(" · ") : u.common.dash;
  }, [trustPresentation, u]);

  const nextSuggestions: string[] =
    status === "success" && effectiveUnifiedResult?.metadata
      ? (() => {
          const raw = (effectiveUnifiedResult.metadata as { nextSuggestions?: unknown }).nextSuggestions;
          return Array.isArray(raw)
            ? raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            : [];
        })()
      : [];

  const activeGoalBanner = useMemo(() => {
    void goalRefreshKey;
    void effectiveUnifiedResult?.metadata;
    if (entryMinimalResultUi) return null;
    const g = readGoalProjectStore().activeGoal;
    if (!g) return null;
    return (
      <p className="execution-result-panel__active-goal text-muted text-sm mb-2" role="status">
        当前目标：{g.title}（{g.currentCount}/{g.targetCount}）
      </p>
    );
  }, [goalRefreshKey, effectiveUnifiedResult, status, entryMinimalResultUi]);

  const outputTrustExportDisplay = useMemo(
    () =>
      trustPresentation
        ? formatHistoryOutputTrustForUi(u, trustPresentation.outputTrust)
        : u.common.dash,
    [trustPresentation, u]
  );

  const exportBodies = useMemo(
    () => resolveExportBodies(effectiveUnifiedResult ?? null, includeLocalFull ? "full" : "default"),
    [effectiveUnifiedResult, includeLocalFull]
  );

  const packageBuildInput: ResultPackageBuildInput | null = useMemo(() => {
    if (!hasRealResult) return null;
    const titleVm =
      displayResultVm?.title?.trim() ||
      resultCard?.title?.trim() ||
      (hasRealResult ? "" : x.resultMockTitle);
    const bodyFallback =
      exportBodies.body ||
      displayResultVm?.body?.trim() ||
      resultCard?.body?.trim() ||
      (!hasRealResult ? x.resultMockBody : "") ||
      "";
    const summaryLine =
      exportBodies.summary ??
      (displayResultVm?.summary?.trim() || undefined);
    const showLocalNote = canIncludeLocalFull && !includeLocalFull;
    const createdIso = successCompletedAt ?? new Date().toISOString();
    return {
      title: titleVm || x.resultMockTitle,
      body: bodyFallback,
      summary: summaryLine,
      prompt: lastPrompt.trim() || "—",
      createdAtIso: createdIso,
      resultSourceDisplay: resultSourceExportDisplay,
      outputTrustDisplay: outputTrustExportDisplay,
      labels: {
        sectionMeta: x.exportSectionMeta,
        sectionResult: x.exportSectionResult,
        fieldPrompt: x.exportFieldPrompt,
        fieldCreatedAt: x.exportFieldCreatedAt,
        fieldResultSource: x.exportFieldResultSource,
        fieldOutputTrust: x.exportFieldOutputTrust,
        fieldTitle: x.exportFieldTitle,
        fieldSummary: x.exportFieldSummary,
        ...(showLocalNote ? { noteLocalSummaryExport: x.exportNoteLocalSummary } : {})
      }
    };
  }, [
    hasRealResult,
    displayResultVm,
    resultCard,
    exportBodies.body,
    exportBodies.summary,
    x,
    lastPrompt,
    successCompletedAt,
    resultSourceExportDisplay,
    outputTrustExportDisplay,
    canIncludeLocalFull,
    includeLocalFull
  ]);

  const runExport = useCallback(
    async (format: "md" | "txt") => {
      if (!packageBuildInput?.body.trim()) return;
      setExportError(null);
      setExportBusy(true);
      try {
        const r = await exportResultPackageFile(format, packageBuildInput, packageBuildInput.title);
        if (r.ok) {
          setLastExportPath(r.filePath);
        } else if (!r.canceled) {
          setExportError(r.error?.trim() || x.exportFailed);
        }
      } finally {
        setExportBusy(false);
      }
    },
    [packageBuildInput, x.exportFailed]
  );

  const onCopyPackage = useCallback(async () => {
    if (!packageBuildInput?.body.trim()) return;
    setExportError(null);
    const r = await copyResultPackageToClipboard("md", packageBuildInput);
    if (r.ok) {
      if (copyNoticeTimerRef.current != null) window.clearTimeout(copyNoticeTimerRef.current);
      setCopyNotice(x.exportCopyDone);
      copyNoticeTimerRef.current = window.setTimeout(() => {
        setCopyNotice(null);
        copyNoticeTimerRef.current = null;
      }, 3200);
    } else {
      setExportError(r.error === "clipboard_unavailable" ? x.exportFailed : r.error || x.exportFailed);
    }
  }, [packageBuildInput, x.exportCopyDone, x.exportFailed]);

  const onSaveResult = useCallback(() => {
    if (!packageBuildInput?.body.trim() || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaveError(null);
    setSaveBusy(true);
    try {
      const title =
        (displayResultVm?.title ?? resultCard?.title ?? packageBuildInput.title)?.trim() || packageBuildInput.title;
      const sources: ResultSource[] =
        trustPresentation && trustPresentation.distinctSources.length > 0
          ? [...trustPresentation.distinctSources]
          : ["fallback"];
      const outputTrust: OutputTrust = trustPresentation?.outputTrust ?? "non_authentic";
      saveSavedResult({
        title,
        prompt: lastPrompt.trim(),
        body: exportBodies.body,
        summary: exportBodies.summary,
        completedAt: successCompletedAt ?? undefined,
        resultSourceDisplay: resultSourceExportDisplay,
        outputTrustDisplay: outputTrustExportDisplay,
        resultSources: sources,
        outputTrust,
        savedWithFullLocal: Boolean(canIncludeLocalFull && includeLocalFull)
      });
      if (saveNoticeTimerRef.current != null) window.clearTimeout(saveNoticeTimerRef.current);
      setSaveNotice(x.saveResultDone);
      saveNoticeTimerRef.current = window.setTimeout(() => {
        setSaveNotice(null);
        saveNoticeTimerRef.current = null;
      }, 3600);
    } catch {
      setSaveError(x.saveResultFailed);
    } finally {
      saveInFlightRef.current = false;
      setSaveBusy(false);
    }
  }, [
    packageBuildInput,
    displayResultVm?.title,
    resultCard?.title,
    trustPresentation,
    lastPrompt,
    exportBodies.body,
    exportBodies.summary,
    successCompletedAt,
    resultSourceExportDisplay,
    outputTrustExportDisplay,
    canIncludeLocalFull,
    includeLocalFull,
    x.saveResultDone,
    x.saveResultFailed
  ]);

  return (
    <section className="execution-result-panel" aria-label={x.regionAria}>
      {activeGoalBanner}
      {status === "idle" ? <ExecutionEmptyState /> : null}

      {simplifiedPresentation && executionSourceStrip && !entryMinimalResultUi ? (
        <WorkbenchSourceStrip source={executionSourceStrip} routerDecision={routerDecision} />
      ) : null}

      {(status === "validating" || status === "queued") && showInFlightProgressUi && (
        <div className="execution-result-panel__block">
          {simplifiedPresentation ? (
            <>
              <p className="workbench-conversation__status" role="status" aria-live="polite">
                {entryMinimalResultUi && runningStatusLine
                  ? runningStatusLine
                  : status === "validating"
                    ? wt.validating
                    : wt.queued}
              </p>
              {simplifiedProgressExtra}
            </>
          ) : (
            <>
              <PreparingSkeleton />
              <p className="execution-result-panel__preparing-label text-muted text-sm">{x.preparing}</p>
            </>
          )}
        </div>
      )}

      {(status === "running" || status === "paused" || status === "stopping") && showInFlightProgressUi && (
        <div className="execution-result-panel__block">
          <p
            className={
              simplifiedPresentation
                ? "workbench-conversation__status"
                : "execution-result-panel__progress text-sm"
            }
            role="status"
            aria-live="polite"
          >
            {simplifiedPresentation
              ? entryMinimalResultUi && runningStatusLine && status === "running"
                ? runningStatusLine
                : status === "running"
                  ? wt.running
                  : status === "paused"
                    ? wt.paused
                    : wt.stopping
              : status === "running"
                ? x.progressRunning
                : status === "paused"
                  ? x.progressPaused
                  : x.progressStopping}
          </p>
          {simplifiedPresentation ? simplifiedProgressExtra : null}
          {workflowChain?.showStop ? (
            <div className="execution-result-panel__workflow-chain mt-2">
              <button type="button" className="ui-btn ui-btn--secondary" onClick={() => workflowChain.onStop()}>
                {workflowChain.stopLabel}
              </button>
            </div>
          ) : null}
          {simplifiedPresentation ? null : (
            <ExecutionLogPreview status={status} rawLogs={streamLogs} />
          )}
        </div>
      )}

      {status === "success" && (
        <div className="execution-result-panel__block">
          {!entryMinimalResultUi
            ? (() => {
                const m = effectiveUnifiedResult?.metadata as {
                  goalCompletedMessage?: unknown;
                  goalAssetizationNote?: unknown;
                  templateSuggestion?: unknown;
                } | undefined;
                const line = typeof m?.goalCompletedMessage === "string" ? m.goalCompletedMessage.trim() : "";
                const note =
                  typeof m?.goalAssetizationNote === "string" ? m.goalAssetizationNote.trim() : "";
                const ts = m?.templateSuggestion;
                const tsObj = ts && typeof ts === "object" ? (ts as Record<string, unknown>) : null;
                const tsDesc = tsObj && typeof tsObj.description === "string" ? tsObj.description.trim() : "";
                const tsId = tsObj && typeof tsObj.templateId === "string" ? tsObj.templateId.trim() : "";
                if (!line && !note && !tsDesc && !tsId) return null;
                return (
                  <div className="execution-result-panel__goal-wrap mb-2" role="status">
                    {line ? (
                      <p className="execution-result-panel__goal-completed text-success font-medium mb-1">{line}</p>
                    ) : null}
                    {note ? <p className="execution-result-panel__goal-asset-note text-muted text-sm mb-0">{note}</p> : null}
                    {tsDesc || tsId ? (
                      <div className="execution-result-panel__template-suggest mt-2" role="region" aria-label="模板建议">
                        <p className="text-sm font-medium mb-1">模板建议</p>
                        {tsDesc ? <p className="text-muted text-sm mb-2">{tsDesc}</p> : null}
                        <Link to="/templates" className="ui-btn ui-btn--secondary text-sm">
                          前往模板页
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })()
            : null}
          {trustPresentation &&
          showExecutionProvenance &&
          !entryMinimalResultUi &&
          !(simplifiedPresentation && degradedBanner) ? (
            <div
              className="execution-result-panel__f3-provenance mb-2"
              role="region"
              aria-label="结果来源说明"
              data-output-trust={trustPresentation.outputTrust}
              data-ai-outcome={trustPresentation.aiOutcome ?? ""}
            >
              <div className="execution-result-panel__f3-provenance-title">结果来源</div>
              <div className="execution-result-panel__f3-chips">
                {trustPresentation.legacySourceUnknown ? (
                  <span
                    className="execution-result-panel__f3-chip"
                    data-source="legacy_unknown"
                    key="legacy"
                  >
                    {EXECUTION_RESULT_LEGACY_SOURCE_UNKNOWN_ZH}
                  </span>
                ) : (
                  trustPresentation.chipSources.map((s) => (
                    <span key={s} className="execution-result-panel__f3-chip" data-source={s}>
                      {resultSourceLabelZh(s)}
                    </span>
                  ))
                )}
              </div>
              <p className="execution-result-panel__f3-trust-hint text-muted text-sm mb-0" role="note">
                {outputTrustHintZh(trustPresentation.outputTrust)}
              </p>
              {trustPresentation.trustSupplementZh ? (
                <p
                  className="execution-result-panel__f3-trust-supplement text-sm mb-0"
                  role="note"
                >
                  {trustPresentation.trustSupplementZh}
                </p>
              ) : null}
            </div>
          ) : null}
          {entryMinimalResultUi &&
          simplifiedPresentation &&
          f3Content &&
          (degradedBanner || isMockPlaceholderTaskResult(effectiveUnifiedResult)) ? (
            <p className="text-muted text-sm mb-2" role="status">
              本次结果仅供参考。
            </p>
          ) : degradedBanner ? (
            <div
              className="workbench-mock-result-banner execution-result-panel__mock-banner mb-2"
              role="status"
            >
              <p className="font-medium mb-1">{degradedBanner.title}</p>
              <p className="text-sm mb-1">{degradedBanner.primary}</p>
              <p className="text-muted text-sm mb-0">{degradedBanner.nextStep}</p>
            </div>
          ) : simplifiedPresentation && !entryMinimalResultUi ? (
            <p
              className="workbench-conversation__status workbench-conversation__status--done text-success font-medium mb-2"
              role="status"
            >
              {trustPresentation
                ? outputTrustSimplifiedSuccessLeadZh(trustPresentation.outputTrust, wt.successTitle)
                : wt.successTitle}
            </p>
          ) : null}
          {!simplifiedPresentation && Array.isArray(streamLogs) && streamLogs.length > 0 ? (
            <div className="execution-result-panel__secondary execution-result-panel__secondary--logs-final">
              <ExecutionLogPreview status={status} rawLogs={streamLogs} />
            </div>
          ) : null}
          {!entryMinimalResultUi &&
          effectiveUnifiedResult?.metadata &&
          (effectiveUnifiedResult.metadata as { memoryInfluence?: boolean }).memoryInfluence ===
            true ? (
            <p className="text-muted text-sm mb-2" role="note">
              本次生成参考了你的历史内容
            </p>
          ) : null}
          <article
            className={
              simplifiedPresentation ? "execution-result-card execution-result-card--conversational" : "execution-result-card"
            }
          >
            <h3 className="execution-result-card__title">
              {hasRealResult
                ? displayResultVm?.title ?? resultCard?.title ?? x.resultMockTitle
                : x.resultMockTitle}
            </h3>
            {simplifiedPresentation ? null : (
              <p className="execution-result-card__source text-muted text-sm">结果来源：{resultSourceLabel}</p>
            )}
            {simplifiedPresentation ? null : lastPrompt ? (
              <p className="execution-result-card__prompt text-muted text-sm mono-block">{lastPrompt}</p>
            ) : null}
            <p className="execution-result-card__body">
              {hasRealResult
                ? displayResultVm?.body ?? resultCard?.body ?? x.resultMockBody
                : x.resultMockBody}
            </p>
            {nextSuggestions.length > 0 && onSubmitSuggestedPrompt ? (
              <div
                className="execution-result-card__next-suggestions"
                role="region"
                aria-label="下一步建议"
              >
                <p className="text-muted text-sm mb-2">下一步建议：</p>
                <ul className="execution-result-card__next-suggestions-list">
                  {nextSuggestions.map((text) => (
                    <li key={text}>
                      <button
                        type="button"
                        className="ui-btn ui-btn--secondary execution-result-panel__suggestion-btn"
                        onClick={() => onSubmitSuggestedPrompt(text)}
                      >
                        {text}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {workflowChain && (workflowChain.showStop || workflowChain.showStart) ? (
              <div
                className="execution-result-panel__workflow-chain mt-2 mb-2"
                role="toolbar"
                aria-label={x.chainToolbarAria}
              >
                {workflowChain.showStop ? (
                  <button type="button" className="ui-btn ui-btn--secondary" onClick={() => workflowChain.onStop()}>
                    {workflowChain.stopLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ui-btn ui-btn--secondary"
                    disabled={Boolean(workflowChain.startDisabled)}
                    onClick={() => workflowChain.onStart()}
                  >
                    {workflowChain.startLabel}
                  </button>
                )}
              </div>
            ) : null}
            {resultAssetization ? (
              <div
                className="execution-result-panel__asset-actions"
                role="region"
                aria-label={x.assetActionsAria}
              >
                {resultAssetization}
              </div>
            ) : null}
            {simplifiedPresentation ? null : (
              <dl className="execution-result-card__summary">
                <div>
                  <dt className="text-muted text-sm">{x.summaryDuration}</dt>
                  <dd className="execution-result-card__dd">{summaryDuration}</dd>
                </div>
                <div>
                  <dt className="text-muted text-sm">{x.summarySteps}</dt>
                  <dd className="execution-result-card__dd">{summaryStepCount}</dd>
                </div>
              </dl>
            )}
            {simplifiedPresentation ? null : (
              <p className="execution-result-card__hint text-muted text-sm">{x.controlBarOnlyHint}</p>
            )}
          </article>
          <div className="execution-result-panel__export">
            <div className="execution-result-panel__export-row">
              <button
                type="button"
                className="ui-btn ui-btn--secondary execution-result-panel__export-btn"
                disabled={exportBusy || !packageBuildInput?.body.trim()}
                onClick={() => void runExport("md")}
              >
                {exportBusy ? x.exportBusy : x.exportMarkdown}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--secondary execution-result-panel__export-btn"
                disabled={exportBusy || !packageBuildInput?.body.trim()}
                onClick={() => void runExport("txt")}
              >
                {exportBusy ? x.exportBusy : x.exportTxt}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--secondary execution-result-panel__export-btn"
                disabled={exportBusy || !packageBuildInput?.body.trim()}
                onClick={() => void onCopyPackage()}
              >
                {x.exportCopy}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--secondary execution-result-panel__export-btn"
                disabled={saveBusy || exportBusy || !packageBuildInput?.body.trim()}
                onClick={() => onSaveResult()}
              >
                {saveBusy ? x.saveResultBusy : x.saveResult}
              </button>
              {onSaveAsAutomation ? (
                <button
                  type="button"
                  className="ui-btn ui-btn--secondary execution-result-panel__export-btn"
                  disabled={exportBusy || saveBusy}
                  onClick={() => onSaveAsAutomation()}
                >
                  {au.saveAsAutomation}
                </button>
              ) : null}
            </div>
            {canIncludeLocalFull ? (
              <label className="execution-result-panel__export-local-full flex items-center gap-2 text-sm mt-2 mb-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeLocalFull}
                  onChange={(e) => setIncludeLocalFull(e.target.checked)}
                />
                <span>{x.exportIncludeLocalFull}</span>
              </label>
            ) : null}
            {copyNotice ? (
              <p className="text-success text-sm mb-0 mt-2" role="status">
                {copyNotice}
              </p>
            ) : null}
            {saveNotice ? (
              <p className="text-success text-sm mb-0 mt-2" role="status">
                {saveNotice}
              </p>
            ) : null}
            {saveError ? (
              <p className="text-danger text-sm mb-0 mt-2" role="status">
                {saveError}
              </p>
            ) : null}
            {exportError ? (
              <p className="text-danger text-sm mb-0 mt-2" role="status">
                {exportError}
              </p>
            ) : null}
            {lastExportPath ? (
              <p className="execution-result-panel__export-path text-muted text-sm mb-0 mt-2" title={lastExportPath}>
                {x.exportLastPath}: {lastExportPath}
              </p>
            ) : null}
          </div>
          {!entryMinimalResultUi &&
          !simplifiedPresentation &&
          effectiveStepResults &&
          Object.keys(effectiveStepResults).length > 0 ? (
            <div className="execution-result-panel__step-results text-muted text-sm">
              <p className="execution-result-panel__step-results-label">各步产出</p>
              <ul className="execution-result-panel__step-results-list">
                {Object.entries(effectiveStepResults).map(([stepId, r]) => {
                  const stepVm = mapTaskResultToResultVM(r, { source: "step" });
                  return (
                    <li key={stepId}>
                      <span className="mono-block">{stepId}</span> · {stepVm.kind}
                      {r.kind === "computer" && r.targetApp ? ` · ${r.targetApp}` : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {successActions ? (
            <div className="execution-result-panel__success-actions">{successActions}</div>
          ) : null}
          {!entryMinimalResultUi && !simplifiedPresentation ? (
            <div className="execution-result-panel__secondary">
              <p className="execution-result-panel__secondary-label text-muted text-sm">{x.stepStreamSecondary}</p>
              <ExecutionStepStream task={null} running={false} stepsOverride={stepsOverride} />
            </div>
          ) : null}
        </div>
      )}

      {status === "error" && failurePresentation ? (
        <div className="execution-result-panel__block">
          <article className="execution-error-card">
            {entryMinimalResultUi ? null : (
              <h3 className="execution-error-card__title">{failurePresentation.title}</h3>
            )}
            <p className="execution-error-card__detail">
              {entryMinimalResultUi ? "这次没有成功，可以再试一次。" : failurePresentation.primary}
            </p>
            {!entryMinimalResultUi && failurePresentation.secondary ? (
              <p className="execution-error-card__detail text-muted text-sm">{failurePresentation.secondary}</p>
            ) : null}
            {!entryMinimalResultUi && failurePresentation.nextStep ? (
              <p className="execution-error-card__detail text-muted text-sm mb-0" role="note">
                {failurePresentation.nextStep}
              </p>
            ) : null}
            {!entryMinimalResultUi && simplifiedPresentation ? (() => {
              const rawErr = (streamError?.trim() || lastErrorMessage || "").trim();
              const net = isWorkbenchLikelyNetworkError(rawErr);
              const timeout = isWorkbenchLikelyTimeoutError(rawErr);
              return (
                <>
                  {net ? (
                    <p className="execution-error-card__detail text-muted text-sm mb-0 mt-2" role="note">
                      {wt.errorNetworkHint}
                    </p>
                  ) : null}
                  {timeout && !net ? (
                    <p className="execution-error-card__detail text-muted text-sm mb-0 mt-2" role="note">
                      {wt.errorTimeoutHint}
                    </p>
                  ) : null}
                </>
              );
            })() : null}
            {(import.meta.env.DEV || !entryMinimalResultUi) && (
              <details className="execution-error-card__technical mt-3">
                <summary className="cursor-pointer text-muted text-sm user-select-none">技术详情</summary>
                <div className="text-muted text-sm mt-2 mb-2">
                  <p className="mb-1">匹配规则：{failurePresentation.matchedRule}</p>
                  {effectiveUnifiedResult?.kind === "content" &&
                  (effectiveUnifiedResult.metadata as Record<string, unknown> | undefined)?.coreResultSourceType ? (
                    <p className="mb-1">
                      resultSourceType：
                      {String(
                        (effectiveUnifiedResult.metadata as Record<string, unknown>).coreResultSourceType
                      )}
                    </p>
                  ) : null}
                  {failurePresentation.technical.errorCodeGuess ? (
                    <p className="mb-1">errorCode：{failurePresentation.technical.errorCodeGuess}</p>
                  ) : null}
                  {routerDecision?.model ? (
                    <p className="mb-1">model：{routerDecision.model}</p>
                  ) : null}
                  {(() => {
                    const m =
                      effectiveUnifiedResult?.kind === "content"
                        ? (effectiveUnifiedResult.metadata as Record<string, unknown> | undefined)
                        : undefined;
                    const rid = m?.requestId;
                    return typeof rid === "string" && rid.trim() ? (
                      <p className="mb-1">requestId：{rid}</p>
                    ) : null;
                  })()}
                </div>
                {import.meta.env.DEV ? (
                  <pre className="execution-error-card__dev-raw text-xs text-pre-wrap break-words mb-0 p-2">
                    {resolveErrorDetail(streamError, lastErrorMessage, x.errorMockFailure, false)}
                  </pre>
                ) : (
                  <p className="text-muted text-sm text-pre-wrap break-words mb-0" role="note">
                    {failurePresentation.technical.rawCombined
                      ? failurePresentation.technical.rawCombined
                      : "（无原始错误文本）"}
                  </p>
                )}
              </details>
            )}
            {authEscalation === "login" ? (
              <p className="execution-error-card__cta">
                <Link to="/login?needLogin=1" className="execution-error-card__link">
                  {u.sessionUx.loginCta}
                </Link>
              </p>
            ) : null}
            {authEscalation === "verified" ? (
              <p className="execution-error-card__hint text-muted text-sm">{u.sessionUx.verifiedPlaceholder}</p>
            ) : null}
            {simplifiedPresentation ? null : (
              <p className="execution-error-card__hint text-muted text-sm">{x.controlBarOnlyHint}</p>
            )}
          </article>
        </div>
      ) : null}
      {status === "stopped" && (
        <div className="execution-result-panel__block">
          <article className="execution-error-card execution-error-card--muted">
            <h3 className="execution-error-card__title">
              {lastErrorMessage.includes("紧急停止") ? wt.stoppedTitle : x.stoppedTitle}
            </h3>
            <p className="execution-error-card__detail text-pre-wrap">
              {simplifiedPresentation
                ? lastErrorMessage.includes("紧急停止")
                  ? wt.stoppedLead
                  : lastErrorMessage.trim()
                    ? toUserFacingExecutionError(lastErrorMessage, null)
                    : x.stoppedLead
                : lastErrorMessage.trim()
                  ? lastErrorMessage
                  : x.stoppedLead}
            </p>
            {simplifiedPresentation ? null : (
              <p className="execution-error-card__hint text-muted text-sm">{x.controlBarOnlyHint}</p>
            )}
          </article>
        </div>
      )}
    </section>
  );
};
