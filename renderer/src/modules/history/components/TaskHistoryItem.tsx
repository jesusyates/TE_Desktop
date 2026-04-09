import { useMemo, type ReactNode } from "react";
import type { TaskHistoryListEntry } from "../types";
import { useUiStrings } from "../../../i18n/useUiStrings";
import { mapBackendStatusToExecutionStatus } from "../../../execution/session/taskExecutionMap";
import { mapHistoryEntryToHistoryItemVM } from "../../../viewmodels";
import {
  formatFormalHistoryStatusForUi,
  formatHistoryOutputTrustForUi,
  formatHistoryResultSourceForUi,
  formatTaskStatusForUi
} from "../../../i18n/formatExecutionUi";

type Props = {
  task: TaskHistoryListEntry;
  selected: boolean;
  onSelect: (task: TaskHistoryListEntry) => void;
  onDismiss?: (task: TaskHistoryListEntry) => void;
  /** 例如「保存为模板」，与主按钮择行并存 */
  extraActions?: ReactNode;
};

const PROMPT_MAX = 52;

function truncate(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n)}…`;
}

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return iso;
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusBadgeLabel(task: TaskHistoryListEntry, u: ReturnType<typeof useUiStrings>): string {
  if (task.source === "server") {
    return formatFormalHistoryStatusForUi(u, task.status);
  }
  if (task.status === "success" || task.status === "error" || task.status === "stopped") {
    return formatFormalHistoryStatusForUi(u, task.status);
  }
  if (task.source === "core") return u.replay.sourceCore;
  return formatTaskStatusForUi(u, task.status);
}

function statusBadgePhase(task: TaskHistoryListEntry): string {
  if (task.source === "server") {
    if (task.status === "success") return "success";
    if (task.status === "error") return "error";
    if (task.status === "stopped") return "stopped";
    return "idle";
  }
  if (task.source === "core") return "success";
  return mapBackendStatusToExecutionStatus(task.status);
}

export const TaskHistoryItem = ({ task, selected, onSelect, onDismiss, extraActions }: Props) => {
  const u = useUiStrings();
  const vm = useMemo(() => mapHistoryEntryToHistoryItemVM(task), [task]);
  const phase = statusBadgePhase(task);
  const previewLine = (vm.preview || "").trim();
  const titleLine = (vm.title || "").trim() || u.common.dash;
  return (
    <div className={`task-history-item-wrap${selected ? " task-history-item-wrap--selected" : ""}`}>
      <button type="button" className="task-history-item" onClick={() => onSelect(task)}>
        <span className="task-history-item__badge-row">
          <span
            className={`task-history-item__statusBadge task-history-item__badge task-history-item__badge--${phase}`}
          >
            {statusBadgeLabel(task, u)}
          </span>
          <span
            className={`task-history-item__resultSourceBadge task-history-item__badge task-history-item__badge--source task-history-item__badge--src-${vm.resultSource}`}
            title={u.history.badgeSourceTitle}
          >
            {formatHistoryResultSourceForUi(u, vm.resultSource)}
          </span>
          <span
            className={`task-history-item__outputTrustBadge task-history-item__badge task-history-item__badge--trust task-history-item__badge--trust-${vm.outputTrust}`}
            title={u.history.badgeTrustTitle}
          >
            {formatHistoryOutputTrustForUi(u, vm.outputTrust)}
          </span>
        </span>
        <span className="task-history-item__prompt">{truncate(titleLine, PROMPT_MAX)}</span>
        {task.source === "server" && task.mode ? (
          <span className="task-history-item__mode text-muted">{task.mode}</span>
        ) : null}
        {previewLine ? (
          <span className="task-history-item__preview text-muted">{truncate(previewLine, 80)}</span>
        ) : null}
        <span className="task-history-item__time text-muted">{formatWhen(vm.updatedAt || vm.createdAt)}</span>
      </button>
      {extraActions || onDismiss ? (
        <div className="task-history-item__side-actions">
          {extraActions}
          {onDismiss ? (
            <button
              type="button"
              className="task-history-item__dismiss"
              aria-label={task.source === "server" ? u.history.deleteRecordAria : u.history.dismissLocalAria}
              title={task.source === "server" ? u.history.deleteRecordTitle : u.history.dismissLocalTitle}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDismiss(task);
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
