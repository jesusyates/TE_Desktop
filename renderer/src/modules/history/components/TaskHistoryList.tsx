import type { ReactNode } from "react";
import type { TaskHistoryListEntry } from "../types";
import { useUiStrings } from "../../../i18n/useUiStrings";
import { TaskHistoryItem } from "./TaskHistoryItem";

type Props = {
  tasks: TaskHistoryListEntry[];
  selectedTaskId: string;
  loading: boolean;
  onSelect: (task: TaskHistoryListEntry) => void;
  /** J-1：正式账户历史走 DELETE /history/:id */
  onDismiss?: (task: TaskHistoryListEntry) => void;
  /** 每条右侧附加控件（不占主点击区） */
  rowExtra?: (task: TaskHistoryListEntry) => ReactNode;
  listClassName?: string;
};

export const TaskHistoryList = ({
  tasks,
  selectedTaskId,
  loading,
  onSelect,
  onDismiss,
  rowExtra,
  listClassName
}: Props) => {
  const u = useUiStrings();
  if (loading && tasks.length === 0) {
    return (
      <div
        className={[
          "task-history-list",
          "task-history-list--loading",
          "text-muted",
          "text-sm",
          listClassName
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {u.history.listLoading}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div
        className={["task-history-list", "task-history-list--empty", "text-muted", "text-sm", listClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {u.history.empty}
      </div>
    );
  }

  return (
    <div
      className={["task-history-list", listClassName].filter(Boolean).join(" ")}
      role="list"
    >
      {tasks.map((task) => (
        <TaskHistoryItem
          key={task.id}
          task={task}
          selected={task.id === selectedTaskId}
          onSelect={onSelect}
          onDismiss={onDismiss}
          extraActions={rowExtra?.(task)}
        />
      ))}
    </div>
  );
};
