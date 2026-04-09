import { useEffect, useMemo, useRef } from "react";
import type { ExecutionStep } from "../../execution/execution.types";
import type { MockLogLine } from "../../execution/session/useMockExecutionLogStream";
import { ExecutionStepStream } from "../../components/workbench/ExecutionStepStream";
import type { TaskResult } from "../result/resultTypes";
import type { TaskVM } from "../../viewmodels/types";
import { mapTaskResultToResultVM } from "../../viewmodels";
import {
  formatResultVmKindForUi,
  formatTaskStatusForUi,
  formatTaskVmSourceForUi
} from "../../i18n/formatExecutionUi";
import { useUiStrings } from "../../i18n/useUiStrings";
import { ExecutionReplayControls } from "./ExecutionReplayControls";
import "./replay.css";

type Props = {
  /** D-7-4I：回放顶栏上下文（与主时间线 TaskVM 同源） */
  replayContextVm?: TaskVM | null;
  lastPrompt: string;
  replayLogs: MockLogLine[];
  replaySteps: ExecutionStep[];
  progress: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (p: number) => void;
  onExitReplay: () => void;
  /** D-5-10：与主结果区同源，回放时仍可看统一结果摘要 */
  unifiedResult?: TaskResult | null;
  stepResults?: Record<string, TaskResult> | null;
};

export const ExecutionReplayPanel = ({
  replayContextVm,
  lastPrompt,
  replayLogs,
  replaySteps,
  progress,
  isPlaying,
  play,
  pause,
  seek,
  onExitReplay,
  unifiedResult,
  stepResults
}: Props) => {
  const u = useUiStrings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const replayResultVm = useMemo(
    () => (unifiedResult ? mapTaskResultToResultVM(unifiedResult, { source: "replay-unified" }) : null),
    [unifiedResult]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [replayLogs]);

  const stepsForStream: ExecutionStep[] = replaySteps;

  return (
    <section className="execution-replay-panel" aria-label={u.replay.panelAriaLabel}>
      <header className="execution-replay-panel__header">
        <h2 className="execution-replay-panel__title">{u.replay.panelTitle}</h2>
        {replayContextVm ? (
          <p className="execution-replay-panel__meta text-muted text-sm">
            <span className="mono-block" title={replayContextVm.id}>
              {replayContextVm.id
                ? `${u.replay.taskIdPrefix} ${replayContextVm.id.slice(-8)}`
                : u.common.dash}
            </span>
            {" · "}
            <span>{formatTaskStatusForUi(u, replayContextVm.status)}</span>
            {" · "}
            <span>{formatTaskVmSourceForUi(u, replayContextVm.source)}</span>
          </p>
        ) : null}
        {lastPrompt ? <p className="execution-replay-panel__prompt text-muted text-sm mono-block">{lastPrompt}</p> : null}
      </header>

      <ExecutionReplayControls
        progress={progress}
        isPlaying={isPlaying}
        onPlay={play}
        onPause={pause}
        onSeek={seek}
        onExit={onExitReplay}
      />

      <div className="execution-replay-panel__body">
        <div className="execution-replay-panel__logs">
          <h3 className="execution-replay-panel__subtitle text-sm">{u.replay.logsTitle}</h3>
          <div ref={scrollRef} className="execution-replay-panel__log-scroll" tabIndex={0}>
            <ul className="execution-log-preview__list">
              {replayLogs.map((line) => (
                <li key={line.id} className="execution-log-item">
                  {line.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="execution-replay-panel__steps">
          <ExecutionStepStream task={null} running={isPlaying && progress < 1} stepsOverride={stepsForStream.length ? stepsForStream : null} />
        </div>
        {replayResultVm ? (
          <div className="execution-replay-panel__unified-result text-sm">
            <h3 className="execution-replay-panel__subtitle">{u.replay.unifiedResultTitle}</h3>
            <p className="execution-replay-panel__unified-meta text-muted text-xs">
              {replayResultVm.source} · {formatResultVmKindForUi(u, replayResultVm.kind)}
            </p>
            <p className="execution-replay-panel__unified-title">{replayResultVm.title}</p>
            <p className="execution-replay-panel__unified-body text-muted">
              {replayResultVm.body.slice(0, 400)}
              {replayResultVm.body.length > 400 ? "…" : ""}
            </p>
          </div>
        ) : null}
        {stepResults && Object.keys(stepResults).length > 0 ? (
          <div className="execution-replay-panel__step-results text-sm text-muted">
            <h3 className="execution-replay-panel__subtitle">{u.replay.stepOutputsTitle}</h3>
            <ul>
              {Object.entries(stepResults).map(([id, r]) => {
                const stepVm = mapTaskResultToResultVM(r, { source: "replay-step" });
                return (
                  <li key={id}>
                    {id} · {formatResultVmKindForUi(u, stepVm.kind)}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
};
