import { useMemo } from "react";
import type { ExecutionStep } from "../../execution/execution.types";
import { useUiStrings } from "../../i18n/useUiStrings";
import { formatStepStatusForUi } from "../../i18n/formatExecutionUi";
import { toUserFacingErrorMessage } from "../../services/userFacingErrorMessage";

type Props = {
  steps: ExecutionStep[];
  /** 服务端/客户端整体仍在执行（用于标出「即将执行」的 pending 步骤） */
  taskIsRunning?: boolean;
};

export const TaskSteps = ({ steps, taskIsRunning }: Props) => {
  const u = useUiStrings();
  const ordered = useMemo(() => [...steps].sort((a, b) => a.order - b.order), [steps]);

  const { currentId, nextPendingId } = useMemo(() => {
    const running = ordered.find((s) => s.status === "running");
    if (running) return { currentId: running.id, nextPendingId: null as string | null };
    if (!taskIsRunning) return { currentId: null as string | null, nextPendingId: null as string | null };
    const next = ordered.find((s) => s.status === "pending");
    if (next) return { currentId: null as string | null, nextPendingId: next.id };
    return { currentId: null as string | null, nextPendingId: null as string | null };
  }, [ordered, taskIsRunning]);

  return (
    <div className="task-steps task-steps--stream" role="list">
      {ordered.map((step, index) => {
        const isCurrent = step.id === currentId;
        const isNextQueue = step.id === nextPendingId && step.status === "pending";
        const isDone = step.status === "success" || step.status === "skipped";
        const isFailed = step.status === "failed";

        const itemClass = [
          "task-steps__item",
          isCurrent ? "task-steps__item--current" : "",
          isNextQueue ? "task-steps__item--queued" : "",
          isDone ? "task-steps__item--done" : "",
          isFailed ? "task-steps__item--failed" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={step.id}
            className={itemClass}
            role="listitem"
            data-status={step.status}
            style={{ animationDelay: `${index * 0.068}s` }}
          >
            <div className="task-steps__rail" aria-hidden>
              <span className="task-steps__rail-dot" />
              {index < ordered.length - 1 ? <span className="task-steps__rail-line" /> : null}
            </div>
            <div className="task-steps__body">
              <div className="task-steps__title-row">
                <span className="task-steps__order">{step.order}</span>
                <span className="task-steps__title-text">{step.title}</span>
                {isCurrent ? (
                  <span className="task-steps__live-badge">
                    <span className="task-steps__live-dot" aria-hidden />
                    {u.common.taskStatusRunning}
                  </span>
                ) : null}
                {isNextQueue ? <span className="task-steps__next-badge">{u.console.stepNext}</span> : null}
              </div>
              <div className="task-steps__meta">
                <span>{formatStepStatusForUi(u, step.status)}</span>
                <span className="task-steps__meta-sep">·</span>
                <span>
                  {step.latency > 0 ? `${step.latency} ms` : "—"}
                </span>
              </div>
              {step.error ? (
                <div className="task-steps__err text-danger text-pre-wrap">
                  {toUserFacingErrorMessage(step.error)}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};
