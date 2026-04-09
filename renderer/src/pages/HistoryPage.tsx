import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useUiStrings } from "../i18n/useUiStrings";
import { TaskHistoryList } from "../modules/history/components/TaskHistoryList";
import { useTemplateLibrary } from "../modules/templates/hooks/useTemplateLibrary";
import { SaveTemplateFromHistoryButton } from "../modules/templates/components/SaveTemplateFromHistoryButton";
import {
  useTaskHistory,
  type TaskHistoryStatusFilter
} from "../modules/history/hooks/useTaskHistory";
import "../modules/history/history.css";

/**
 * J-1：正式 History 页 — 与侧栏同源（useTaskHistory + DELETE /history/:id），不依本地 warm 为真相。
 */
export const HistoryPage = () => {
  const u = useUiStrings();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TaskHistoryStatusFilter>("all");
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
  } = useTaskHistory(statusFilter);

  const te = useTemplateLibrary();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fillWorkbench = (prompt: string, historyId: string) => {
    const p = prompt.trim();
    const rid = historyId.trim();
    if (!p || !rid) return;
    navigate(`/workbench?q=${encodeURIComponent(p)}&runId=${encodeURIComponent(rid)}`);
  };

  return (
    <div className="page-stack history-page">
      <header className="page-header">
        <h1 className="page-title">{u.history.title}</h1>
        <p className="page-lead">{u.history.lead}</p>
      </header>

      <Card title={u.history.explainTitle}>
        <p className="text-muted mb-2">{u.history.explainWhat}</p>
        <p className="text-muted mb-2">{u.history.explainFillOnly}</p>
        <p className="text-muted mb-2">{u.history.explainNotChat}</p>
        <p className="text-muted mb-0">{u.history.saveAsTemplateExplain}</p>
      </Card>

      <Card title={u.history.filter}>
        <select
          className="ui-select ui-select--narrow"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskHistoryStatusFilter)}
          aria-label={u.history.filter}
        >
          <option value="all">{u.common.filterAll}</option>
          <option value="success">{u.history.formalStatusSuccess}</option>
          <option value="error">{u.history.formalStatusError}</option>
          <option value="stopped">{u.history.formalStatusStopped}</option>
        </select>
      </Card>

      <div className="history-page__toolbar">
        <span className="text-muted text-sm">{total > 0 ? u.history.totalRows(total) : null}</span>
        <Button variant="ghost" type="button" onClick={() => void refresh()} disabled={loading}>
          {u.history.panelRefresh}
        </Button>
      </div>

      {error ? (
        <p className="text-danger" role="alert">
          {u.history.errPrefix}：{error}
        </p>
      ) : null}

      <section className="history-page__records" aria-label={u.history.title}>
        <TaskHistoryList
          tasks={tasks}
          selectedTaskId={selectedId ?? ""}
          loading={loading}
          listClassName="task-history-list--page"
          onSelect={(t) => {
            setSelectedId(t.id);
            fillWorkbench(t.prompt || "", t.historyId || t.id);
          }}
          onDismiss={(t) => void removeHistoryEntry(t)}
          rowExtra={(t) => (
            <SaveTemplateFromHistoryButton task={t} saveTemplateFromTask={te.saveTemplateFromTask} compact />
          )}
        />
      </section>

      {hasMore ? (
        <div className="history-page__pager">
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
    </div>
  );
};
