import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useUiStrings } from "../i18n/useUiStrings";
import { Button } from "../components/ui/Button";
import {
  deleteMemoryById,
  fetchMemoryById,
  fetchMemoryList,
  type MemoryDetailVm,
  type MemoryListItemVm
} from "../services/coreMemoryService";
import { memoryListItemToRecordRowVm, type MemoryRecordRowVm } from "../modules/memory/memoryRecordVm";
import {
  getMemoryUiMark,
  setMemoryUiHidden,
  setMemoryUiPinned
} from "../modules/memory/memoryUiMarksStorage";
import { loadAppPreferences, subscribeAppPreferences } from "../modules/preferences/appPreferences";
import type { UiCatalog } from "../i18n/uiCatalog";
import "./memory-page.css";

const PAGE_SIZE = 20;

const MEMORY_TYPE_PRESET_VALUES = [
  "",
  "style_preference",
  "platform_preference",
  "mode_preference",
  "template_preference",
  "successful_task_hint"
] as const;

function formatDateTime(iso: string): string {
  const t = iso?.trim();
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString();
}

function formatValueForDisplay(raw: string): { formatted: string; isStructured: boolean } {
  const s = raw ?? "";
  const trimmed = s.trim();
  if (!trimmed) return { formatted: "—", isStructured: false };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed !== null && (typeof parsed === "object" || Array.isArray(parsed))) {
      return { formatted: JSON.stringify(parsed, null, 2), isStructured: true };
    }
  } catch {
    /* plain */
  }
  return { formatted: s, isStructured: false };
}

function sourceCategoryLabel(mp: UiCatalog["memoryPage"], cat: MemoryRecordRowVm["sourceCategory"]): string {
  switch (cat) {
    case "task":
      return mp.sourceCatTask;
    case "template":
      return mp.sourceCatTemplate;
    case "user":
      return mp.sourceCatUser;
    case "result":
      return mp.sourceCatResult;
    default:
      return mp.sourceCatUnknown;
  }
}

/** H-2：可管理 Memory 正式页（与执行 hints、设置开关闭环） */
export const MemoryPage = () => {
  const u = useUiStrings();
  const mp = u.memoryPage;
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [typePreset, setTypePreset] = useState<string>("");
  const [typeCustom, setTypeCustom] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [list, setList] = useState<MemoryListItemVm[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemoryDetailVm | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [prefsTick, setPrefsTick] = useState(0);
  const [marksTick, setMarksTick] = useState(0);
  const [showIgnored, setShowIgnored] = useState(false);
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  useEffect(() => subscribeAppPreferences(() => setPrefsTick((n) => n + 1)), []);

  const applyMemoryHints = useMemo(
    () => loadAppPreferences().memoryTemplate.applyMemoryHintsInTasks,
    [prefsTick]
  );

  const effectiveMemoryType = typeCustom.trim() || typePreset.trim();

  const loadList = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const { list: rows, total: t } = await fetchMemoryList({
        page,
        pageSize: PAGE_SIZE,
        ...(effectiveMemoryType ? { memoryType: effectiveMemoryType } : {}),
        ...(!includeInactive ? { isActive: "true" } : {})
      });
      setList(rows);
      setTotal(typeof t === "number" && Number.isFinite(t) ? t : rows.length);
    } catch (e) {
      setList([]);
      setTotal(0);
      setListError(e instanceof Error ? e.message : mp.loadError);
    } finally {
      setLoading(false);
    }
  }, [page, effectiveMemoryType, includeInactive, mp.loadError]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [effectiveMemoryType, includeInactive]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const rowsVm = useMemo(() => list.map(memoryListItemToRecordRowVm), [list]);

  const visibleRows = useMemo(() => {
    return rowsVm.filter((r) => {
      const m = getMemoryUiMark(r.id);
      if (!showIgnored && m.hidden) return false;
      if (onlyPinned && !m.pinned) return false;
      return true;
    });
  }, [rowsVm, showIgnored, onlyPinned, marksTick]);

  const focusFromUrl = searchParams.get("focus")?.trim() ?? "";

  useEffect(() => {
    if (!focusFromUrl || !list.length) return;
    if (list.some((r) => r.memoryId === focusFromUrl)) {
      setDetailId(focusFromUrl);
    }
  }, [focusFromUrl, list]);

  const closeDetail = useCallback(() => {
    setDetailId(null);
    if (focusFromUrl) {
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }
  }, [focusFromUrl, searchParams, setSearchParams]);

  const bumpMarks = () => setMarksTick((n) => n + 1);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void (async () => {
      try {
        const d = await fetchMemoryById(detailId);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(e instanceof Error ? e.message : mp.detailLoadError);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detailId, mp.detailLoadError]);

  const presetOptions = useMemo(() => {
    return MEMORY_TYPE_PRESET_VALUES.map((v) => ({
      value: v,
      label: v === "" ? mp.filterTypeAll : mp.memoryTypePresets[v] ?? v
    }));
  }, [mp]);

  useEffect(() => {
    if (!detailId) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailId, closeDetail]);

  const runDelete = async (id: string) => {
    if (!window.confirm(mp.deleteConfirm)) return;
    setDeleteBusyId(id);
    try {
      await deleteMemoryById(id);
      if (detailId === id) closeDetail();
      await loadList();
    } catch (e) {
      window.alert(`${mp.deleteFail}: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setDeleteBusyId(null);
    }
  };

  return (
    <div className="memory-page">
      <header className="memory-page__header">
        <h1 className="memory-page__title">{mp.title}</h1>
        <p className="memory-page__lead text-muted">{mp.lead}</p>
        <div className="memory-page__badges" role="group" aria-label={mp.readOnlyBadge}>
          <span className="memory-page__badge memory-page__badge--hint">{mp.readOnlyBadge}</span>
          <span className="memory-page__badge memory-page__badge--hint">{mp.workbenchHint}</span>
        </div>
      </header>

      <section className="memory-page__explain" aria-labelledby="mem-h2-how">
        <h2 id="mem-h2-how" className="memory-page__explain-title">
          {mp.h2HowTitle}
        </h2>
        <p className="memory-page__explain-body text-muted">{mp.h2HowBody}</p>
        <p className="mb-0">
          <Link className="memory-page__link" to="/settings">
            {mp.openSettingsMemory}
          </Link>
        </p>
      </section>

      {!applyMemoryHints ? (
        <p className="memory-page__warn" role="status">
          {mp.hintsDisabledBanner}
        </p>
      ) : null}

      <section className="memory-page__toolbar" aria-label={mp.filterType}>
        <label className="memory-page__field">
          <span className="memory-page__label">{mp.filterType}</span>
          <select
            className="memory-page__select"
            value={typePreset}
            onChange={(e) => setTypePreset(e.target.value)}
            aria-label={mp.filterType}
          >
            {presetOptions.map((o) => (
              <option key={o.value || "__all__"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="memory-page__field memory-page__field--grow">
          <span className="memory-page__label">{mp.typeCustomPlaceholder}</span>
          <input
            className="memory-page__input"
            type="text"
            value={typeCustom}
            onChange={(e) => setTypeCustom(e.target.value)}
            placeholder={mp.typeCustomPlaceholder}
            aria-label={mp.typeCustomPlaceholder}
          />
        </label>
        <label className="memory-page__check">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          <span>{mp.includeInactive}</span>
        </label>
        <label className="memory-page__check">
          <input
            type="checkbox"
            checked={showIgnored}
            onChange={(e) => setShowIgnored(e.target.checked)}
          />
          <span>{mp.showIgnored}</span>
        </label>
        <label className="memory-page__check">
          <input type="checkbox" checked={onlyPinned} onChange={(e) => setOnlyPinned(e.target.checked)} />
          <span>{mp.filterPinned}</span>
        </label>
        <Button type="button" variant="secondary" onClick={() => void loadList()}>
          {mp.btnRefresh}
        </Button>
      </section>

      {listError ? (
        <p className="memory-page__error" role="alert">
          {mp.loadError}
          <span className="memory-page__error-detail">{listError}</span>
        </p>
      ) : null}

      <div className="memory-page__table-wrap">
        {loading ? (
          <p className="text-muted">{mp.loading}</p>
        ) : visibleRows.length === 0 ? (
          <p className="text-muted">{mp.empty}</p>
        ) : (
          <table className="memory-page__table">
            <thead>
              <tr>
                <th scope="col">{mp.colSummary}</th>
                <th scope="col">{mp.colOrigin}</th>
                <th scope="col">{mp.colSource}</th>
                <th scope="col">{mp.colType}</th>
                <th scope="col">{mp.colCreated}</th>
                <th scope="col">{mp.colAction}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const mark = getMemoryUiMark(row.id);
                return (
                  <tr key={row.id} className={mark.pinned ? "memory-page__tr--pinned" : undefined}>
                    <td className="memory-page__cell-preview">{row.summary}</td>
                    <td>
                      <span className="memory-page__pill">
                        {row.originKind === "user_explicit" ? mp.originUserSaved : mp.originSystem}
                      </span>
                    </td>
                    <td>
                      <div className="memory-page__source-cell">
                        <span className="text-muted text-sm">{sourceCategoryLabel(mp, row.sourceCategory)}</span>
                        <code className="memory-page__code memory-page__code--sm">{row.sourceRaw}</code>
                      </div>
                    </td>
                    <td>
                      <code className="memory-page__code">{row.memoryType}</code>
                    </td>
                    <td className="text-muted text-sm">{formatDateTime(row.createdAt)}</td>
                    <td>
                      <div className="memory-page__row-actions">
                        <Button type="button" variant="ghost" onClick={() => setDetailId(row.id)}>
                          {mp.openDetail}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setMemoryUiPinned(row.id, !mark.pinned);
                            bumpMarks();
                          }}
                        >
                          {mark.pinned ? mp.btnUnpin : mp.btnPin}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setMemoryUiHidden(row.id, !mark.hidden);
                            bumpMarks();
                          }}
                        >
                          {mark.hidden ? mp.btnUnignore : mp.btnIgnore}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={deleteBusyId === row.id}
                          onClick={() => void runDelete(row.id)}
                        >
                          {deleteBusyId === row.id ? "…" : mp.btnDelete}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && list.length > 0 ? (
        <footer className="memory-page__pager">
          <span className="text-muted text-sm">
            {mp.totalLabel(total)} · {mp.pageLabel(page, totalPages)}
          </span>
          <div className="memory-page__pager-btns">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {mp.btnPrev}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {mp.btnNext}
            </Button>
          </div>
        </footer>
      ) : null}

      {detailId ? (
        <div className="memory-page__modal-root" role="presentation" onClick={closeDetail}>
          <div
            className="memory-page__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="memory-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="memory-page__modal-head">
              <h2 id="memory-detail-title" className="memory-page__modal-title">
                {mp.detailTitle}
              </h2>
              <Button type="button" variant="ghost" onClick={closeDetail}>
                {mp.detailClose}
              </Button>
            </header>
            {detailLoading ? (
              <p className="text-muted">{mp.detailLoading}</p>
            ) : detailError ? (
              <p className="memory-page__error" role="alert">
                {mp.detailLoadError} {detailError}
              </p>
            ) : detail ? (
              <>
                <div className="memory-page__modal-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={deleteBusyId === detail.memoryId}
                    onClick={() => void runDelete(detail.memoryId)}
                  >
                    {mp.detailDelete}
                  </Button>
                </div>
                <dl className="memory-page__detail">
                  <dt>{mp.colType}</dt>
                  <dd>
                    <code className="memory-page__code">{detail.memoryType}</code>
                  </dd>
                  <dt>{mp.colKey}</dt>
                  <dd>{detail.key || "—"}</dd>
                  <dt>{mp.detailSourceId}</dt>
                  <dd>
                    <code className="memory-page__code memory-page__code--sm">{detail.sourceId || "—"}</code>
                  </dd>
                  <dt>{mp.colSource}</dt>
                  <dd>{detail.source || "—"}</dd>
                  <dt>{mp.colCreated}</dt>
                  <dd className="text-muted">{formatDateTime(detail.createdAt)}</dd>
                  <dt>{mp.colUpdated}</dt>
                  <dd className="text-muted">{formatDateTime(detail.updatedAt)}</dd>
                  <dt>{mp.colActive}</dt>
                  <dd>{detail.isActive ? mp.activeYes : mp.activeNo}</dd>
                  <dt>{mp.detailValueLabel}</dt>
                  <dd className="memory-page__detail-value">
                    {(() => {
                      const { formatted, isStructured } = formatValueForDisplay(detail.value);
                      return (
                        <>
                          <span className="text-muted text-sm memory-page__value-kind">
                            {isStructured ? mp.detailValueStructured : mp.detailValuePlain}
                          </span>
                          <pre className="memory-page__value-pre">{formatted}</pre>
                        </>
                      );
                    })()}
                  </dd>
                </dl>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
