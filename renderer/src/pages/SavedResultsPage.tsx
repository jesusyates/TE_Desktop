import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useUiStrings } from "../i18n/useUiStrings";
import { createAutomationFromSavedResult } from "../modules/automation/createAutomationFromSource";
import { buildAutomationConsoleUrl } from "../modules/automation/automationNavigation";
import { deleteSavedResult, listSavedResultsSorted } from "../modules/savedResults/savedResultsStore";
import "./saved-results-page.css";

/**
 * Saved Results v1：本机用户主动沉淀的结果资产列表（与账户任务历史分离）。
 */
export const SavedResultsPage = () => {
  const u = useUiStrings();
  const au = u.automation;
  const navigate = useNavigate();
  const [rev, setRev] = useState(0);
  const items = useMemo(() => {
    void rev;
    return listSavedResultsSorted();
  }, [rev]);

  const refresh = useCallback(() => setRev((n) => n + 1), []);

  const openItem = (id: string) => {
    const sid = id.trim();
    if (!sid) return;
    navigate(`/workbench?savedId=${encodeURIComponent(sid)}`);
  };

  const remove = (id: string) => {
    if (!window.confirm(u.savedResults.confirmDelete)) return;
    deleteSavedResult(id);
    refresh();
  };

  const createAutomationFromRow = (row: (typeof items)[number]) => {
    const rec = createAutomationFromSavedResult(row);
    navigate(buildAutomationConsoleUrl(rec.id), { state: { automationToastShowView: true } });
  };

  return (
    <div className="page-stack saved-results-page">
      <header className="page-header">
        <h1 className="page-title">{u.savedResults.title}</h1>
        <p className="page-lead">{u.savedResults.lead}</p>
      </header>

      <Card title={u.savedResults.vsHistoryTitle}>
        <p className="text-muted mb-0">{u.savedResults.vsHistoryBody}</p>
      </Card>

      <Card title={u.savedResults.listTitle}>
        {items.length === 0 ? (
          <p className="text-muted mb-0">{u.savedResults.empty}</p>
        ) : (
          <ul className="saved-results-page__list">
            {items.map((row) => (
              <li key={row.id} className="saved-results-page__row">
                <div className="saved-results-page__title font-medium">{row.title.trim() || "—"}</div>
                <p className="text-muted text-sm mono-block saved-results-page__prompt-preview">
                  {row.prompt.length > 200 ? `${row.prompt.slice(0, 200)}…` : row.prompt}
                </p>
                <div className="text-muted text-xs saved-results-page__meta">
                  {u.savedResults.savedAtLabel}: {row.savedAt}
                  {row.savedWithFullLocal ? ` · ${u.savedResults.fullLocalBadge}` : ""}
                </div>
                <div className="page-row gap-2 saved-results-page__actions">
                  <Button variant="primary" type="button" onClick={() => openItem(row.id)}>
                    {u.savedResults.open}
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => createAutomationFromRow(row)}>
                    {au.createFromSavedResult}
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => remove(row.id)}>
                    {u.savedResults.delete}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
