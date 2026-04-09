import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUiStrings } from "../../../i18n/useUiStrings";
import { useTaskHistory } from "../hooks/useTaskHistory";
import { TaskHistoryList } from "./TaskHistoryList";
import "../history.css";

/**
 * J-1：账户正式历史侧栏 — 与 /history 同源；分页、正式删除；点击跳转工作台（q + runId，不自动执行）。
 */
export const TaskHistoryPanel = () => {
  const u = useUiStrings();
  const navigate = useNavigate();
  const {
    tasks,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    hasMore,
    total,
    removeHistoryEntry
  } = useTaskHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <aside className="task-history-panel" aria-label={u.history.title}>
      <header className="task-history-panel__header">
        <span className="task-history-panel__title">
          {u.history.title}
          <span className="task-history-panel__source text-muted">{u.history.panelSourceBadge}</span>
        </span>
        <button
          type="button"
          className="task-history-panel__refresh"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {u.history.panelRefresh}
        </button>
      </header>
      <p className="task-history-panel__hint text-muted text-xs px-3 py-1 mb-0">{u.history.panelHint}</p>
      {error ? <div className="task-history-panel__error text-sm">{error}</div> : null}
      <div className="task-history-panel__meta text-muted text-xs px-3 py-1">
        {total > 0 ? u.history.totalRows(total) : null}
      </div>
      <TaskHistoryList
        tasks={tasks}
        selectedTaskId={selectedId ?? ""}
        loading={loading}
        onSelect={(t) => {
          setSelectedId(t.id);
          const p = (t.prompt || "").trim();
          const rid = (t.historyId || t.id || "").trim();
          if (!p || !rid) return;
          navigate(`/workbench?q=${encodeURIComponent(p)}&runId=${encodeURIComponent(rid)}`);
        }}
        onDismiss={(t) => void removeHistoryEntry(t)}
      />
      {hasMore ? (
        <div className="task-history-panel__pager">
          <button
            type="button"
            className="task-history-panel__load-more"
            onClick={() => void loadMore()}
            disabled={loadingMore || loading}
          >
            {loadingMore ? u.history.panelLoadMoreBusy : u.history.panelLoadMore}
          </button>
        </div>
      ) : null}
    </aside>
  );
};
