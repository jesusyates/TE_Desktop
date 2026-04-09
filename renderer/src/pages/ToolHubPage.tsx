import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useUiStrings } from "../i18n/useUiStrings";
import { useAuthStore } from "../store/authStore";
import { getAicsDesktop } from "../services/desktopBridge";
import { apiClient } from "../services/apiClient";
import { inferRequiredCapabilitiesApi, resolveCapabilitiesApi } from "../services/capabilityBridge";
import { listToolRequests, type ToolRequestRow } from "../services/toolRequestApi";
import type { CapabilityCatalogEntry, CapabilityResolution, ScannedTool } from "../types/desktopRuntime";
import { HUB_CATEGORY_CAPS, HUB_RECOMMENDED_ORDER, type HubCategoryId } from "../components/toolHub/hubCategories";
import { deriveHubStatus, type HubCardStatus } from "../components/toolHub/deriveHubStatus";
import { ToolRequestEntry } from "../components/tool/ToolRequestEntry";
import { Input } from "../components/ui/Input";

function normalizeCatalog(items: CapabilityCatalogEntry[]): CapabilityCatalogEntry[] {
  return items.map((c) => ({
    id: c.id,
    label: c.label,
    keywords: Array.isArray(c.keywords) ? c.keywords : [],
    expectLocalApp: Boolean(c.expectLocalApp)
  }));
}

function matchesSearch(
  entry: CapabilityCatalogEntry,
  q: string,
  inferHits: string[] | null,
  desc: unknown
): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  if (entry.label.toLowerCase().includes(t)) return true;
  const d = typeof desc === "string" ? desc.toLowerCase() : "";
  if (d.includes(t)) return true;
  for (const k of entry.keywords) {
    const kw = k.toLowerCase();
    if (kw.includes(t) || t.includes(kw)) return true;
  }
  if (inferHits && inferHits.includes(entry.id)) return true;
  return false;
}

const reqStatusLabel = (u: ReturnType<typeof useUiStrings>, s: string) => {
  switch (s) {
    case "approved":
      return u.console.statusApproved;
    case "rejected":
      return u.console.statusRejected;
    case "review":
    case "under_review":
      return u.console.statusReview;
    case "submitted":
      return u.console.statusSubmitted;
    default:
      return u.console.statusSubmitted;
  }
};

export const ToolHubPage = () => {
  const u = useUiStrings();
  const navigate = useNavigate();
  const [hubSearchParams, setHubSearchParams] = useSearchParams();
  const locale = useAuthStore((s) => s.locale);
  const [catalog, setCatalog] = useState<CapabilityCatalogEntry[]>([]);
  const [tools, setTools] = useState<ScannedTool[]>([]);
  const [resByCap, setResByCap] = useState<Record<string, CapabilityResolution>>({});
  const [tab, setTab] = useState<HubCategoryId>("copy");
  const [search, setSearch] = useState("");
  const [inferHits, setInferHits] = useState<string[] | null>(null);
  const [reqs, setReqs] = useState<ToolRequestRow[] | null>(null);
  const [reqErr, setReqErr] = useState("");

  const loadCatalogAndScan = useCallback(() => {
    const loc = locale || "en-US";
    const b = getAicsDesktop();
    if (b) {
      void b.getSoftwareScan().then((s) => {
        setTools(Array.isArray(s.tools) ? s.tools : []);
      });
      void b.getCapabilityCatalog(loc).then((c) => setCatalog(normalizeCatalog(c as CapabilityCatalogEntry[])));
      return;
    }
    setTools([]);
    void apiClient
      .get<{ items: CapabilityCatalogEntry[] }>("/aics/capability-catalog", { params: { locale: loc } })
      .then((r) => setCatalog(normalizeCatalog(r.data.items ?? [])))
      .catch(() => setCatalog([]));
  }, [locale]);

  const loadRequests = useCallback(() => {
    setReqErr("");
    void listToolRequests()
      .then(setReqs)
      .catch(() => {
        setReqs(null);
        setReqErr(u.toolHub.listErr);
      });
  }, [u.toolHub.listErr]);

  useEffect(() => {
    loadCatalogAndScan();
  }, [loadCatalogAndScan]);

  useEffect(() => {
    const intent = hubSearchParams.get("intent")?.trim();
    if (!intent) return;
    setSearch(intent);
    setHubSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("intent");
        return next;
      },
      { replace: true }
    );
  }, [hubSearchParams, setHubSearchParams]);

  useEffect(() => {
    if (tab === "my_tools") loadRequests();
  }, [tab, loadRequests]);

  useEffect(() => {
    const h = window.setTimeout(() => {
      const q = search.trim();
      if (!q) {
        setInferHits(null);
        return;
      }
      void inferRequiredCapabilitiesApi(q, []).then((ids) => setInferHits(ids));
    }, 220);
    return () => window.clearTimeout(h);
  }, [search]);

  const allIds = useMemo(() => catalog.map((c) => c.id), [catalog]);

  useEffect(() => {
    if (allIds.length === 0) {
      setResByCap({});
      return;
    }
    let cancelled = false;
    void resolveCapabilitiesApi(tools, allIds).then((list) => {
      if (cancelled) return;
      const m: Record<string, CapabilityResolution> = {};
      for (const r of list) m[r.capability] = r;
      setResByCap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [tools, allIds]);

  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const tabs: { id: HubCategoryId; label: string }[] = [
    { id: "copy", label: u.toolHub.catCopy },
    { id: "video", label: u.toolHub.catVideo },
    { id: "sheet", label: u.toolHub.catSheet },
    { id: "image", label: u.toolHub.catImage },
    { id: "auto", label: u.toolHub.catAuto },
    { id: "my_tools", label: u.toolHub.catMine }
  ];

  const filteredCaps = useMemo(() => {
    if (tab === "my_tools") return [];
    const allow = new Set(HUB_CATEGORY_CAPS[tab]);
    return catalog.filter((c) => allow.has(c.id)).filter((c) => matchesSearch(c, search, inferHits, u.toolHub.capDescriptions[c.id as keyof typeof u.toolHub.capDescriptions]));
  }, [catalog, tab, search, inferHits, u.toolHub.capDescriptions]);

  const recommended = useMemo(() => {
    const list: CapabilityCatalogEntry[] = [];
    for (const id of HUB_RECOMMENDED_ORDER) {
      const c = catalogById.get(id);
      if (c) list.push(c);
    }
    return list;
  }, [catalogById]);

  const goWorkbench = (prompt: string) => {
    navigate(`/workbench?q=${encodeURIComponent(prompt.trim())}`);
  };

  const starterFor = (capId: string) => {
    const m = u.toolHub.capStarters as Record<string, string | undefined>;
    return m[capId] ?? u.toolHub.capStarters.document_editing;
  };

  const statusClass = (s: HubCardStatus) => {
    if (s === "installed") return "tool-hub-card__status tool-hub-card__status--ok";
    if (s === "alternative") return "tool-hub-card__status tool-hub-card__status--alt";
    return "tool-hub-card__status tool-hub-card__status--miss";
  };

  const statusText = (s: HubCardStatus) => {
    if (s === "installed") return u.toolHub.statusInstalled;
    if (s === "alternative") return u.toolHub.statusAlt;
    return u.toolHub.statusMissing;
  };

  const renderCard = (c: CapabilityCatalogEntry, opts?: { compact?: boolean }) => {
    const res = resByCap[c.id];
    const st = deriveHubStatus(res, c.expectLocalApp);
    const desc =
      u.toolHub.capDescriptions[c.id as keyof typeof u.toolHub.capDescriptions] ||
      u.toolHub.lead;
    return (
      <article key={c.id} className={`tool-hub-card${opts?.compact ? " tool-hub-card--compact" : ""}`}>
        <div className="tool-hub-card__top">
          <h3 className="tool-hub-card__name">{c.label}</h3>
          <span className={statusClass(st)}>{statusText(st)}</span>
        </div>
        <p className="tool-hub-card__desc">{desc}</p>
        <div className="tool-hub-card__cta">
          <button type="button" className="tool-hub-card__btn" onClick={() => goWorkbench(starterFor(c.id))}>
            {u.toolHub.startCta}
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="page-stack tool-hub-outer">
      <div className="tool-hub">
      <header className="tool-hub__hero">
        <h1 className="tool-hub__title">{u.toolHub.title}</h1>
        <p className="tool-hub__lead text-muted">{u.toolHub.lead}</p>
        <p className="text-sm mb-2">
          <Link to="/tools">{u.toolsPage.title}</Link>
          <span className="text-muted"> — {u.toolsPage.totpCardTitle}</span>
        </p>
        <div className="tool-hub__search">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={u.toolHub.searchPh}
            aria-label={u.toolHub.searchAria}
            className="tool-hub__search-input"
          />
        </div>
      </header>

      <nav className="tool-hub__tabs" aria-label={u.toolHub.title}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tool-hub__tab"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "my_tools" ? (
        <section className="tool-hub__section">
          <div className="tool-hub__my-head">
            <p className="text-muted text-sm">{u.toolHub.myLead}</p>
            <ToolRequestEntry onSubmitted={loadRequests} />
          </div>
          {reqErr ? <p className="text-warning text-sm">{reqErr}</p> : null}
          {reqs === null && !reqErr ? <p className="text-muted">{u.toolHub.loadingList}</p> : null}
          {reqs && reqs.length === 0 ? <p className="text-muted">{u.toolHub.myEmpty}</p> : null}
          {reqs && reqs.length > 0 ? (
            <ul className="tool-hub__req-list">
              {reqs.map((r) => (
                <li key={r.id} className="tool-hub__req-card">
                  <div className="tool-hub__req-row">
                    <span className="tool-hub__req-k">{u.toolHub.myCapability}</span>
                    <span>{catalogById.get(r.capability)?.label ?? r.capability}</span>
                  </div>
                  <div className="tool-hub__req-row">
                    <span className="tool-hub__req-k">{u.toolHub.myPurpose}</span>
                    <span>{r.purpose || "—"}</span>
                  </div>
                  <div className="tool-hub__req-status">{reqStatusLabel(u, r.status)}</div>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="tool-hub__footnote text-muted text-sm">{u.toolHub.requestEntryHint}</p>
        </section>
      ) : (
        <>
          <section className="tool-hub__grid" aria-label={u.toolHub.title}>
            {filteredCaps.length === 0 ? (
              <p className="tool-hub__empty text-muted">{u.toolHub.emptyFilter}</p>
            ) : (
              filteredCaps.map((c) => renderCard(c))
            )}
          </section>

          <section className="tool-hub__rec">
            <h2 className="tool-hub__rec-title">{u.toolHub.recTitle}</h2>
            <p className="tool-hub__rec-lead text-muted text-sm">{u.toolHub.recLead}</p>
            <div className="tool-hub__grid tool-hub__grid--rec">{recommended.map((c) => renderCard(c, { compact: true }))}</div>
          </section>
        </>
      )}
      </div>
    </div>
  );
};
