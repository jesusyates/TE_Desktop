import type { ExecutionAction, ExecutionStatus } from "../../../execution/session/execution";
import { useUiStrings } from "../../../i18n/useUiStrings";
import { Button } from "../../ui/Button";
import { ExecutionStatusBadge } from "./ExecutionStatusBadge";

function sessionHint(
  status: ExecutionStatus,
  x: ReturnType<typeof useUiStrings>["console"]["executionSession"]
): string {
  switch (status) {
    case "idle":
      return x.hintIdle;
    case "validating":
      return x.hintValidating;
    case "queued":
      return x.hintQueued;
    case "running":
      return x.hintRunning;
    case "paused":
      return x.hintPaused;
    case "stopping":
      return x.hintStopping;
    case "stopped":
      return x.hintStopped;
    case "success":
      return x.hintSuccess;
    case "error":
      return x.hintError;
    default:
      return "";
  }
}

function actionLabel(action: ExecutionAction, x: ReturnType<typeof useUiStrings>["console"]["executionSession"]) {
  switch (action) {
    case "start":
      return x.actionStart;
    case "pause":
      return x.actionPause;
    case "resume":
      return x.actionResume;
    case "stop":
      return x.actionStop;
    case "retry":
      return x.actionRetry;
    case "clear":
      return x.actionClear;
    default:
      return action;
  }
}

export type ExecutionControlBarProps = {
  status: ExecutionStatus;
  allowedActions: ExecutionAction[];
  onAction: (action: ExecutionAction) => void;
  /** D-7-4A：紧急停止（独立于 dispatch） */
  showEmergencyStop?: boolean;
  onEmergencyStop?: () => void;
};

export const ExecutionControlBar = ({
  status,
  allowedActions,
  onAction,
  showEmergencyStop = false,
  onEmergencyStop
}: ExecutionControlBarProps) => {
  const u = useUiStrings();
  const x = u.console.executionSession;
  const hint = sessionHint(status, x);

  return (
    <section className="execution-control-bar" aria-label={x.regionAria}>
      <div className="execution-control-bar__row">
        <div className="execution-control-bar__status">
          <ExecutionStatusBadge status={status} />
          <p className="execution-control-bar__hint">{hint}</p>
        </div>
        <div className="execution-control-bar__actions" role="toolbar" aria-label={x.regionAria}>
          {showEmergencyStop && onEmergencyStop ? (
            <Button
              type="button"
              variant="primary"
              className="execution-control-bar__emergency"
              onClick={() => onEmergencyStop()}
            >
              {x.actionEmergencyStop}
            </Button>
          ) : null}
          {allowedActions.map((a) => (
            <Button
              key={a}
              type="button"
              variant={a === "stop" ? "secondary" : a === "retry" ? "primary" : "secondary"}
              onClick={() => onAction(a)}
            >
              {actionLabel(a, x)}
            </Button>
          ))}
        </div>
      </div>
      <p className="execution-control-bar__mock-foot text-sm">{x.mockFootnote}</p>
    </section>
  );
};
