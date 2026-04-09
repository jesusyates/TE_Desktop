import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useUiStrings } from "../i18n/useUiStrings";
import { useAuthStore } from "../store/authStore";
import { Card as CardBox } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import type { FormalTemplateRecord } from "../domain/models/formalTemplateRecord";
import {
  fetchTemplateById,
  fetchTemplateList,
  type FetchTemplateListParams
} from "../services/coreTemplateService";
import { createAutomationFromTemplateDetail } from "../modules/automation/createAutomationFromSource";
import { buildAutomationConsoleUrl } from "../modules/automation/automationNavigation";
import { noteTemplateRecentOpened } from "../services/recentTemplatesStorage";
import { readRecentTemplateIds } from "../services/recentTemplatesStorage";
import { loadAppPreferences, patchAppPreferences } from "../modules/preferences/appPreferences";
import { bumpTemplateUseCount, getTemplateUseCount } from "../services/templateUseStatsStorage";

type TabId = "library" | "mine" | "favorites" | "recent";
type ListSortId = "updated" | "favoriteFirst" | "title";

const PAGE_SIZE = 20;

/** H-3：模板列表产品化（详情、来源、本机使用次、排序、与记忆区分） */
export const TemplatesPage = () => {
  const u = useUiStrings();
  const tp = u.templates;
  const au = u.automation;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = useAuthStore((s) => s.userId?.trim() ?? "");

  const [tab, setTab] = useState<TabId>(() => loadAppPreferences().memoryTemplate.defaultTemplatesTab);
  const [listSort, setListSort] = useState<ListSortId>("updated");
  const [statsTick, setStatsTick] = useState(0);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FormalTemplateRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === "library" || raw === "mine" || raw === "favorites" || raw === "recent") {
      setTab(raw);
    }
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [tab]);

  const selectTab = (id: TabId) => {
    setTab(id);
    patchAppPreferences({ memoryTemplate: { defaultTemplatesTab: id } });
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (tab === "recent") {
          const { list } = await fetchTemplateList({ page: 1, pageSize: 100 });
          if (cancelled) return;
          const order = readRecentTemplateIds();
          const byId = new Map(list.map((t) => [t.templateId, t]));
          const ordered: FormalTemplateRecord[] = [];
          for (const id of order) {
            const row = byId.get(id);
            if (row) ordered.push(row);
          }
          setItems(ordered);
          setTotal(ordered.length);
        } else {
          const params: FetchTemplateListParams = { page, pageSize: PAGE_SIZE };
          if (tab === "library") params.isSystem = true;
          if (tab === "mine") params.isSystem = false;
          if (tab === "favorites") params.isFavorite = true;
          const { list, total: t } = await fetchTemplateList(params);
          if (cancelled) return;
          setItems(list);
          setTotal(t);
        }
      } catch (e) {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
        setLoadError(e instanceof Error ? e.message : tp.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.key, tab, page, tp.loadError]);

  const displayItems = useMemo(() => {
    if (tab === "recent") return items;
    const arr = [...items];
    if (listSort === "title") {
      arr.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" }));
    } else if (listSort === "favoriteFirst") {
      arr.sort((a, b) => {
        const fav = Number(b.isFavorite) - Number(a.isFavorite);
        if (fav !== 0) return fav;
        return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
      });
    } else {
      arr.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    }
    return arr;
  }, [items, tab, listSort]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const emptyLabel = useMemo(() => {
    switch (tab) {
      case "mine":
        return tp.emptyMine;
      case "favorites":
        return tp.emptyFavorites;
      case "recent":
        return tp.emptyRecent;
      default:
        return tp.emptyLibrary;
    }
  }, [tab, tp]);

  const openInWorkbench = (t: FormalTemplateRecord) => {
    noteTemplateRecentOpened(t.templateId);
    bumpTemplateUseCount(t.templateId);
    setStatsTick((n) => n + 1);
    navigate(`/workbench?templateId=${encodeURIComponent(t.templateId)}`);
  };

  const onCreateAutomationFromCard = async (t: FormalTemplateRecord, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const detail = await fetchTemplateById(t.templateId);
      const rec = createAutomationFromTemplateDetail(detail);
      navigate(buildAutomationConsoleUrl(rec.id), { state: { automationToastShowView: true } });
    } catch (err) {
      window.alert(`${tp.loadError}${err instanceof Error ? `: ${err.message}` : ""}`);
    }
  };

  return (
    <div className="page-stack">
      <header className="page-header">
        <h1 className="page-title">{tp.title}</h1>
        <p className="page-lead">{tp.lead}</p>
        <p className="page-lead text-muted text-sm">{tp.leadCore}</p>
        <p className="text-muted text-sm mb-0">{tp.listTabsExplain}</p>
        {userId ? (
          <p className="text-muted text-sm templates-page__session-hint">
            {tp.sessionHint(userId.length > 12 ? `${userId.slice(0, 10)}…` : userId)}
          </p>
        ) : null}
      </header>

      <section className="templates-page__explain" aria-labelledby="tpl-compare-h2">
        <h2 id="tpl-compare-h2" className="templates-page__explain-title">
          {tp.memoryVsTemplateTitle}
        </h2>
        <p className="text-muted text-sm mb-0">{tp.memoryVsTemplateBody}</p>
        <p className="mt-2 mb-0">
          <Link to="/memory">{tp.detailLinkMemory}</Link>
        </p>
      </section>

      <CardBox title={tp.card}>
        <div className="templates-page__tabs" role="tablist" aria-label={tp.title}>
          {(
            [
              ["library", tp.tabLibrary],
              ["mine", tp.tabMine],
              ["favorites", tp.tabFavorites],
              ["recent", tp.tabRecent]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`templates-page__tab${tab === id ? " templates-page__tab--active" : ""}`}
              onClick={() => selectTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab !== "recent" ? (
          <div className="templates-page__sort-row">
            <label className="templates-page__sort">
              <select
                className="ui-select templates-page__sort-select"
                value={listSort}
                onChange={(e) => setListSort(e.target.value as ListSortId)}
                aria-label={tp.sortByUpdated}
              >
                <option value="updated">{tp.sortByUpdated}</option>
                <option value="favoriteFirst">{tp.sortFavoriteFirst}</option>
                <option value="title">{tp.sortByTitle}</option>
              </select>
            </label>
          </div>
        ) : (
          <p className="text-muted text-sm templates-page__recent-hint">{tp.recentOrderHint}</p>
        )}

        {loadError ? (
          <p className="templates-page__error" role="alert">
            {tp.loadError}
            <span className="templates-page__error-detail">{loadError}</span>
          </p>
        ) : null}

        {loading ? (
          <p className="text-muted">{tp.loadingList}</p>
        ) : displayItems.length === 0 ? (
          <p className="auto-placeholder">{emptyLabel}</p>
        ) : (
          <ul
            className="templates-page__grid"
            aria-label={
              tab === "library"
                ? tp.tabLibrary
                : tab === "mine"
                  ? tp.tabMine
                  : tab === "favorites"
                    ? tp.tabFavorites
                    : tp.tabRecent
            }
          >
            {displayItems.map((t) => {
              const useN = getTemplateUseCount(t.templateId);
              return (
                <li key={t.templateId} className="template-card">
                  <button
                    type="button"
                    className="template-card__main"
                    onClick={() => openInWorkbench(t)}
                  >
                    <span className="template-card__title">{t.title}</span>
                    <span
                      className={
                        "template-card__badge" +
                        (t.isSystem ? " template-card__badge--system" : " template-card__badge--user")
                      }
                    >
                      {t.isSystem ? tp.badgeSystem : tp.badgeUser}
                    </span>
                  </button>
                  {t.description ? (
                    <p className="template-card__desc text-muted text-sm">{t.description}</p>
                  ) : null}
                  <p className="template-card__meta text-muted text-sm">
                    {[
                      t.product && t.product !== "aics" ? t.product : null,
                      t.workflowType || null,
                      t.market !== "global" ? t.market : null,
                      t.locale !== "und" ? t.locale : null,
                      t.version && t.version !== "1" ? `v${t.version}` : null,
                      t.audience && t.audience !== "general" ? t.audience : null
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {t.updatedAt ? ` · ${t.updatedAt.slice(0, 10)}` : null}
                    {t.isFavorite ? ` · ★` : null}
                  </p>
                  {useN > 0 ? (
                    <p className="template-card__use text-muted text-xs mb-0">{tp.useCountLocal(useN)}</p>
                  ) : null}
                  <div className="template-card__footer">
                    <Link className="template-card__detail-link" to={`/templates/${encodeURIComponent(t.templateId)}`}>
                      {tp.btnDetail}
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={(e) => void onCreateAutomationFromCard(t, e)}
                    >
                      {au.createFromTemplate}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => openInWorkbench(t)}>
                      {tp.btnUseInWorkbench}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && displayItems.length > 0 && tab !== "recent" ? (
          <footer className="templates-page__pager">
            <span className="text-muted text-sm">
              {tp.pageStatus(page, totalPages)} · {tp.totalRows(total)}
            </span>
            <div className="templates-page__pager-btns">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {tp.pagePrev}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {tp.pageNext}
              </Button>
            </div>
          </footer>
        ) : null}
      </CardBox>
    </div>
  );
};
