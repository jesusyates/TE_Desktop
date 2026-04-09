import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ExecutionStatus } from "../../execution/session/execution";
import {
  runIntelPostCritic,
  runIntelPreFlight,
  type ContentActionKind,
  type IntelOrchestrationTrace
} from "../../modules/contentIntelligence";
import { fetchHistoryListPage } from "../../services/history.api";
import { contentIntelPreflightOnCore } from "../../services/api";
import { useUiStrings } from "../../i18n/useUiStrings";
import { Button } from "../ui/Button";
import "./content-intel-panel.css";

type Props = {
  prompt: string;
  onApplyToPrompt: (next: string) => void;
  sessionStatus: ExecutionStatus;
  resultTitle?: string | undefined;
  resultBodyPreview?: string | undefined;
};

const MIN_PROMPT = 10;
const DEBOUNCE_MS = 650;

export function ContentIntelWorkbenchPanel({
  prompt,
  onApplyToPrompt,
  sessionStatus,
  resultTitle,
  resultBodyPreview
}: Props) {
  const u = useUiStrings();
  const ci = u.contentIntel;
  const [trace, setTrace] = useState<IntelOrchestrationTrace | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preflightSource, setPreflightSource] = useState<"core" | "local" | null>(null);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const p = prompt.trim();
    if (p.length < MIN_PROMPT) {
      setTrace(null);
      setErr(null);
      setPreflightSource(null);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const data = await fetchHistoryListPage(1, 60, null);
      let t: IntelOrchestrationTrace;
      try {
        t = await contentIntelPreflightOnCore({ prompt: p, historyItems: data.items });
        setPreflightSource("core");
      } catch {
        t = runIntelPreFlight(p, data.items);
        setPreflightSource("local");
      }
      if (
        sessionStatus === "success" &&
        (resultTitle?.trim() || resultBodyPreview?.trim())
      ) {
        t = runIntelPostCritic(t, resultTitle ?? "", resultBodyPreview ?? "", data.items);
      }
      setTrace(t);
    } catch (e) {
      setTrace(null);
      setPreflightSource(null);
      setErr(e instanceof Error ? e.message : ci.historyErr);
    } finally {
      setBusy(false);
    }
  }, [prompt, sessionStatus, resultTitle, resultBodyPreview, ci.historyErr]);

  useEffect(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    const p = prompt.trim();
    if (p.length < MIN_PROMPT) {
      setTrace(null);
      setErr(null);
      setPreflightSource(null);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      void refresh();
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [prompt, refresh]);

  if (prompt.trim().length < MIN_PROMPT) {
    return (
      <div className="content-intel-panel content-intel-panel--idle text-muted text-sm" role="region" aria-label={ci.panelTitle}>
        {ci.emptyPrompt}
      </div>
    );
  }

  const strategistPayload = trace?.steps.find((s) => s.role === "strategist")?.payload as
    | { recommendedAction?: ContentActionKind; nextTopics?: string[]; rationale?: string }
    | undefined;
  const librarianPayload = trace?.steps.find((s) => s.role === "librarian")?.payload as
    | { duplicateRisk?: string; maxScore?: number; topSimilar?: { historyId: string; score: number }[] }
    | undefined;
  const action = strategistPayload?.recommendedAction;

  return (
    <div className="content-intel-panel" role="region" aria-label={ci.panelTitle}>
      <div className="content-intel-panel__head">
        <h3 className="content-intel-panel__title">{ci.panelTitle}</h3>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void refresh()}>
          {busy ? ci.loadingHistory : ci.refresh}
        </Button>
      </div>
      <p className="content-intel-panel__lead text-muted text-sm">{ci.panelLead}</p>
      {preflightSource ? (
        <p className="content-intel-panel__source text-xs text-muted mb-2" role="status">
          {preflightSource === "core" ? ci.preflightSourceCore : ci.preflightSourceLocal}
        </p>
      ) : null}
      {err ? (
        <p className="content-intel-panel__err text-sm" role="alert">
          {ci.historyErr} ({err})
        </p>
      ) : null}
      {trace ? (
        <>
          <p className="content-intel-panel__trace-id text-muted text-xs mono-block mb-2">
            {ci.orchestrationId}: {trace.orchestrationId}
          </p>
          {librarianPayload ? (
            <div className="content-intel-panel__summary mb-2">
              <span className="content-intel-panel__pill">
                {ci.duplicateRisk}: {librarianPayload.duplicateRisk ?? "—"}
              </span>
              <span className="content-intel-panel__pill">
                {ci.maxSimilarity}:{" "}
                {typeof librarianPayload.maxScore === "number"
                  ? `${(librarianPayload.maxScore * 100).toFixed(0)}%`
                  : "—"}
              </span>
              {action ? (
                <span className="content-intel-panel__pill content-intel-panel__pill--accent">
                  {ci.suggestedAction}: {ci.actionLabels[action]}
                </span>
              ) : null}
            </div>
          ) : null}
          {strategistPayload?.rationale ? (
            <p className="text-sm mb-2">{strategistPayload.rationale}</p>
          ) : null}
          {strategistPayload?.nextTopics?.length ? (
            <div className="content-intel-panel__topics mb-3">
              <div className="text-sm font-medium mb-1">{ci.nextTopics}</div>
              <ul className="content-intel-panel__topic-list">
                {strategistPayload.nextTopics.map((t) => (
                  <li key={t}>
                    <button type="button" className="content-intel-panel__topic-btn" onClick={() => onApplyToPrompt(t)}>
                      {ci.applyTopic}: {t}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {trace.relatedHistoryIds.length ? (
            <div className="content-intel-panel__related mb-3">
              <div className="text-sm font-medium mb-1">{ci.relatedHistory}</div>
              <p className="text-muted text-xs mb-1 mono-block">{trace.relatedHistoryIds.slice(0, 6).join(", ")}</p>
              <Link to="/history" className="text-sm">
                → {u.nav.history}
              </Link>
            </div>
          ) : null}
          <details className="content-intel-panel__details">
            <summary>{ci.stepsTitle}</summary>
            <ol className="content-intel-panel__steps">
              {trace.steps.map((s, i) => (
                <li key={`${s.role}-${i}`} className="content-intel-panel__step">
                  <div className="content-intel-panel__step-head">
                    <span className="content-intel-panel__role">{ci.roleLabels[s.role]}</span>
                    <span className="text-muted text-xs">{s.ts}</span>
                  </div>
                  <p className="content-intel-panel__step-sum text-sm mb-1">{s.summary}</p>
                  <pre className="content-intel-panel__payload">{JSON.stringify(s.payload, null, 2)}</pre>
                </li>
              ))}
            </ol>
          </details>
          {trace.steps.some((s) => s.role === "critic") ? (
            <p className="text-muted text-xs mt-2 mb-0">{ci.criticTitle}</p>
          ) : null}
          <details className="content-intel-panel__details mt-2">
            <summary>{ci.safetyNotes}</summary>
            <ul className="text-sm text-muted mb-0">
              {trace.safetyNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        </>
      ) : busy ? (
        <p className="text-muted text-sm">{ci.loadingHistory}</p>
      ) : null}
    </div>
  );
}
