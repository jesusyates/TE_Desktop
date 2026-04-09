import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useUiStrings } from "../i18n/useUiStrings";
import { AutomationList } from "../modules/automation/components/AutomationList";
import { AutomationDetailPanel } from "../modules/automation/components/AutomationDetailPanel";
import { CreateAutomationMenu } from "../modules/automation/components/CreateAutomationMenu";
import { listAutomationRecords, deleteAutomationRecord } from "../modules/automation/automationStore";
import type { AutomationRecord } from "../modules/automation/automationTypes";
import { createEmptyAutomation } from "../modules/automation/createAutomationFromSource";
import { buildAutomationConsoleUrl } from "../modules/automation/automationNavigation";
import "./automation-console-page.css";

function safeList(): AutomationRecord[] {
  try {
    return listAutomationRecords();
  } catch {
    return [];
  }
}

export const AutomationConsolePage = () => {
  const u = useUiStrings();
  const a = u.automation;
  const navigate = useNavigate();
  const location = useLocation();
  const detailAnchorRef = useRef<HTMLDivElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<AutomationRecord[]>(safeList);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createdToast, setCreatedToast] = useState(false);
  const [createdToastShowView, setCreatedToastShowView] = useState(false);

  const refresh = useCallback(() => {
    setItems(safeList());
  }, []);

  const focusParam = searchParams.get("focus")?.trim();
  useEffect(() => {
    if (!focusParam) return;
    setSelectedId(focusParam);
    refresh();
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("focus");
        return n;
      },
      { replace: true }
    );
  }, [focusParam, refresh, setSearchParams]);

  const toastParam = searchParams.get("toast")?.trim();
  useEffect(() => {
    if (toastParam !== "created") return;
    const prevState = (location.state ?? {}) as Record<string, unknown>;
    const showView = prevState.automationToastShowView === true;
    setCreatedToastShowView(showView);
    setCreatedToast(true);
    const { automationToastShowView: _drop, ...rest } = prevState;
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("toast");
        return n;
      },
      { replace: true }
    );
    navigate(".", { replace: true, state: rest });
    /* Read `location.state` only when `toast=created` matches; omit from deps so stripping state via `navigate` does not retrigger this effect. */
  }, [toastParam, setSearchParams, navigate]);

  useEffect(() => {
    if (!createdToast) return;
    const id = window.setTimeout(() => {
      setCreatedToast(false);
      setCreatedToastShowView(false);
    }, 4200);
    return () => window.clearTimeout(id);
  }, [createdToast]);

  const selected = useMemo(
    () => (selectedId ? items.find((x) => x.id === selectedId) ?? null : null),
    [items, selectedId]
  );

  useEffect(() => {
    if (selectedId && !items.some((x) => x.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  const formatUpdatedAt = useCallback((iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  }, []);

  const handleDelete = (id: string) => {
    if (!window.confirm(`${a.deleteConfirmTitle}\n\n${a.deleteConfirmBody}`)) return;
    const idx = items.findIndex((x) => x.id === id);
    deleteAutomationRecord(id);
    refresh();
    const fresh = safeList();
    if (selectedId === id) {
      if (fresh.length === 0) {
        setSelectedId(null);
      } else {
        const nextId = fresh[idx]?.id ?? fresh[idx - 1]?.id ?? fresh[0]!.id;
        setSelectedId(nextId);
      }
    }
  };

  const quickBlank = () => {
    const rec = createEmptyAutomation(a.unnamedAutomationTitle);
    navigate(buildAutomationConsoleUrl(rec.id), { state: { automationToastShowView: false } });
  };

  return (
    <div className="page-stack automation-console-page">
      {createdToast ? (
        <div className="automation-console-page__toast" role="status">
          <div>{a.toastAutomationCreated}</div>
          {createdToastShowView ? (
            <div className="automation-console-page__toast-actions">
              <Button
                type="button"
                variant="secondary"
                className="btn btn--sm"
                onClick={() => detailAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
              >
                {a.toastAutomationCreatedView}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <header className="page-header">
        <h1 className="page-title">{a.title}</h1>
        <p className="page-lead">{a.subtitle}</p>
        <ul className="automation-console-page__notices text-muted text-sm">
          <li>{a.topNotice1}</li>
          <li>{a.topNotice2}</li>
          <li>{a.topNotice3}</li>
        </ul>
      </header>

      <Card title={a.operationsCard}>
        <div className="automation-console-page__toolbar">
          <CreateAutomationMenu u={u} />
          <p className="text-muted text-sm mb-0">{a.manualOnlyHint}</p>
        </div>
      </Card>

      <div className="automation-console-page__split">
        <Card title={a.listCard} className="automation-console-page__list-card">
          {items.length === 0 ? (
            <div className="automation-console-page__empty">
              <p className="font-medium mb-1">{a.emptyTitle}</p>
              <p className="text-muted text-sm mb-2">{a.emptyBody}</p>
              <div className="automation-console-page__empty-actions page-row gap-2 flex-wrap">
                <Button type="button" variant="primary" onClick={() => navigate("/templates")}>
                  {a.emptyQuickTemplates}
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate("/saved-results")}>
                  {a.emptyQuickSaved}
                </Button>
                <Button type="button" variant="secondary" onClick={quickBlank}>
                  {a.emptyQuickBlank}
                </Button>
              </div>
              <p className="text-muted text-xs mb-0 mt-2">
                <Link to="/workbench">{u.nav.workbench}</Link>
                {" · "}
                <Link to="/templates">{a.createFromTemplate}</Link>
              </p>
            </div>
          ) : (
            <AutomationList
              u={u}
              records={items}
              formatUpdatedAt={formatUpdatedAt}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onDelete={handleDelete}
            />
          )}
        </Card>

        <div ref={detailAnchorRef} className="automation-console-page__detail-anchor">
          <Card title={a.detailCardTitle} className="automation-console-page__detail-card">
          {selected ? (
            <AutomationDetailPanel
              u={u}
              record={selected}
              onRecordsMutated={refresh}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <p className="text-muted text-sm mb-0">{a.detailPlaceholder}</p>
          )}
          </Card>
        </div>
      </div>
    </div>
  );
};
