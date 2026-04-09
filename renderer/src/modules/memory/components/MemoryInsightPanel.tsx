import { useUiStrings } from "../../../i18n/useUiStrings";
import type { UiCatalog } from "../../../i18n/uiCatalog";
import type { ResolvedTaskMode } from "../../../types/taskMode";
import { getMemoryInsightsSnapshot } from "../memoryQuery";
import type { MemoryFailureType } from "../memoryTypes";
import "../memory-insight-panel.css";

const PATTERN_SHOW = 6;
const CAP_SHOW = 10;
const FAILURE_TYPE_SHOW = 6;

function modeLabel(mode: ResolvedTaskMode, u: UiCatalog): string {
  switch (mode) {
    case "content":
      return u.settings.defaultTaskModeContent;
    case "computer":
      return u.settings.defaultTaskModeComputer;
    default:
      return mode;
  }
}

function failureTypeLabel(ft: MemoryFailureType, u: UiCatalog): string {
  const s = u.settings;
  switch (ft) {
    case "safety":
      return s.memoryFailureTypeSafety;
    case "permission":
      return s.memoryFailureTypePermission;
    case "budget":
      return s.memoryFailureTypeBudget;
    case "runtime":
      return s.memoryFailureTypeRuntime;
    case "empty_result":
      return s.memoryFailureTypeEmptyResult;
    default:
      return s.memoryFailureTypeUnknown;
  }
}

/**
 * D-7-4S：设置页等使用的轻量洞察；数据仅来自 {@link getMemoryInsightsSnapshot}（内部即 buildMemorySnapshotForTaskHints）。
 */
export function MemoryInsightPanel() {
  const u = useUiStrings();
  const insights = getMemoryInsightsSnapshot();

  const successfulPatterns = insights.recentSuccessfulPatterns
    .filter((row) => row.type === "successful_pattern")
    .slice(0, PATTERN_SHOW);

  const caps = insights.successfulCapabilities.slice(0, CAP_SHOW);
  const modes = insights.preferredModes;
  const failureTypes = insights.recentFailureTypes.slice(0, FAILURE_TYPE_SHOW);

  const hasAnything =
    modes.length > 0 || caps.length > 0 || successfulPatterns.length > 0 || failureTypes.length > 0;

  return (
    <div className="memory-insight-panel" aria-label={u.settings.memoryInsightCard}>
      <p className="memory-insight-panel__note text-muted">{u.settings.memoryInsightLocalNote}</p>
      {!hasAnything ? (
        <p className="memory-insight-panel__empty">{u.settings.memoryInsightEmpty}</p>
      ) : null}

      {modes.length > 0 ? (
        <section className="memory-insight-panel__section">
          <h3 className="memory-insight-panel__heading">{u.settings.memoryInsightPreferredModes}</h3>
          <ol className="memory-insight-panel__list">
            {modes.map((m) => (
              <li key={m} className="memory-insight-panel__item">
                {modeLabel(m, u)}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {caps.length > 0 ? (
        <section className="memory-insight-panel__section">
          <h3 className="memory-insight-panel__heading">{u.settings.memoryInsightSuccessCaps}</h3>
          <ol className="memory-insight-panel__list">
            {caps.map((id) => (
              <li key={id} className="memory-insight-panel__item">
                <span className="settings-diag-mono">{id}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {successfulPatterns.length > 0 ? (
        <section className="memory-insight-panel__section">
          <h3 className="memory-insight-panel__heading">{u.settings.memoryInsightPatterns}</h3>
          <ol className="memory-insight-panel__list">
            {successfulPatterns.map((row) => (
              <li key={row.id} className="memory-insight-panel__item">
                <span className="settings-diag-mono">{row.patternKey}</span>
                {typeof row.successCount === "number" && row.successCount > 0 ? (
                  <span className="memory-insight-panel__muted">
                    {" "}
                    · {u.settings.memoryPatternSuccess(row.successCount)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {failureTypes.length > 0 ? (
        <section className="memory-insight-panel__section">
          <h3 className="memory-insight-panel__heading">{u.settings.memoryInsightFailures}</h3>
          <ol className="memory-insight-panel__list">
            {failureTypes.map((row) => (
              <li key={row.failureType} className="memory-insight-panel__item">
                {failureTypeLabel(row.failureType, u)}
                <span className="memory-insight-panel__muted"> · {row.count}</span>
              </li>
            ))}
          </ol>
          <p className="memory-insight-panel__failure-foot">{u.settings.memoryInsightFailureFoot}</p>
        </section>
      ) : null}
    </div>
  );
}
