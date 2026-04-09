import type { UiCatalog } from "../../../i18n/uiCatalog";
import type { AutomationRecord } from "../automationTypes";
import { displayStepTitle, stepKindLabel } from "../automationStepDisplay";

export type AutomationDraftPreviewPanelProps = {
  u: UiCatalog;
  record: AutomationRecord;
};

/**
 * 工作台只读：自动化草案配置预览（非历史、非已保存结果、无运行态）。
 */
export function AutomationDraftPreviewPanel({ u, record }: AutomationDraftPreviewPanelProps) {
  const a = u.automation;
  return (
    <section className="automation-draft-preview" aria-label={a.draftPreviewAria}>
      <div className="automation-draft-preview__head">
        <h3 className="automation-draft-preview__title">{record.title.trim() || "—"}</h3>
        <span className="automation-draft-preview__badge" title={a.manualOnlyHint}>
          {a.notLiveBadge}
        </span>
      </div>
      {record.description?.trim() ? (
        <p className="text-muted text-sm">{record.description.trim()}</p>
      ) : null}
      <p className="text-sm mb-2">{a.draftPreviewLead}</p>
      <p className="text-muted text-xs mb-2">{a.cardConfigOnlyShort} · {a.notRunningHint}</p>
      {record.prompt?.trim() ? (
        <div className="automation-draft-preview__prompt">
          <span className="form-label">{a.fieldPrompt}</span>
          <pre className="automation-draft-preview__pre mono-block text-sm">{record.prompt}</pre>
        </div>
      ) : null}
      <div className="automation-draft-preview__steps">
        <span className="form-label">{a.detailSteps}</span>
        {record.steps.length === 0 ? (
          <p className="text-muted text-sm mb-0">{a.stepsEmptyHint}</p>
        ) : (
          <ol className="automation-draft-preview__ol">
            {record.steps.map((s) => (
              <li key={s.id} className={s.enabled ? "" : "text-muted"}>
                <span className="text-sm">{displayStepTitle(u, s)}</span>{" "}
                <span className="text-muted text-xs">({stepKindLabel(u, s.kind)})</span>
                {!s.enabled ? <span className="text-xs"> — {a.stepDisabledSuffix}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="text-muted text-xs mb-0">{a.manualOnlyHint}</p>
    </section>
  );
}
