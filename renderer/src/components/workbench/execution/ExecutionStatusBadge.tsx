import type { ExecutionStatus } from "../../../execution/session/execution";
import { useUiStrings } from "../../../i18n/useUiStrings";

function badgeModifier(status: ExecutionStatus): string {
  if (status === "success") return "execution-status-badge--success";
  if (status === "error") return "execution-status-badge--error";
  if (status === "running" || status === "validating" || status === "queued" || status === "stopping")
    return "execution-status-badge--active";
  if (status === "paused") return "execution-status-badge--paused";
  if (status === "stopped") return "execution-status-badge--stopped";
  return "execution-status-badge--idle";
}

function statusLabel(
  status: ExecutionStatus,
  x: ReturnType<typeof useUiStrings>["console"]["executionSession"]
): string {
  switch (status) {
    case "idle":
      return x.statusIdle;
    case "validating":
      return x.statusValidating;
    case "queued":
      return x.statusQueued;
    case "running":
      return x.statusRunning;
    case "paused":
      return x.statusPaused;
    case "stopping":
      return x.statusStopping;
    case "stopped":
      return x.statusStopped;
    case "success":
      return x.statusSuccess;
    case "error":
      return x.statusError;
    default:
      return status;
  }
}

type Props = {
  status: ExecutionStatus;
};

export const ExecutionStatusBadge = ({ status }: Props) => {
  const u = useUiStrings();
  const label = statusLabel(status, u.console.executionSession);
  return (
    <span className={`execution-status-badge ${badgeModifier(status)}`} data-status={status}>
      {label}
    </span>
  );
};
