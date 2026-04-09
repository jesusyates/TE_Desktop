import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { UiCatalog } from "../../../i18n/uiCatalog";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import { fetchTemplateById } from "../../../services/coreTemplateService";
import { getSavedResult } from "../../savedResults/savedResultsStore";
import {
  deleteAutomationRecord,
  toggleAutomationStatus,
  updateAutomationRecord
} from "../automationStore";
import type { AutomationRecord, AutomationStatus } from "../automationTypes";
import { countEnabledSteps, displayStepTitle, stepKindLabel } from "../automationStepDisplay";

export type AutomationDetailPanelProps = {
  u: UiCatalog;
  record: AutomationRecord;
  onRecordsMutated: () => void;
  onClose: () => void;
};

function sourceLabel(u: UiCatalog, record: AutomationRecord): string {
  switch (record.sourceType) {
    case "template":
      return u.automation.sourceTemplate;
    case "saved_result":
      return u.automation.sourceSavedResult;
    case "workbench_result":
      return u.automation.sourceWorkbench;
    default:
      return u.automation.sourceManual;
  }
}

function triggerLabel(u: UiCatalog, record: AutomationRecord): string {
  switch (record.triggerType) {
    case "schedule_reserved":
      return u.automation.triggerScheduleReserved;
    case "event_reserved":
      return u.automation.triggerEventReserved;
    default:
      return u.automation.triggerManual;
  }
}

function statusMeaning(u: UiCatalog, status: AutomationStatus): string {
  switch (status) {
    case "ready":
      return u.automation.readyMeaning;
    case "paused":
      return u.automation.pausedMeaning;
    default:
      return u.automation.draftMeaning;
  }
}

export function AutomationDetailPanel({ u, record, onRecordsMutated, onClose }: AutomationDetailPanelProps) {
  const a = u.automation;
  const navigate = useNavigate();
  const [title, setTitle] = useState(record.title);
  const [description, setDescription] = useState(record.description ?? "");
  const [status, setStatus] = useState<AutomationStatus>(record.status);
  const [sourceMissing, setSourceMissing] = useState<boolean | null>(null);

  useEffect(() => {
    setTitle(record.title);
    setDescription(record.description ?? "");
    setStatus(record.status);
  }, [record.id, record.title, record.description, record.status]);

  useEffect(() => {
    let cancelled = false;
    if (record.sourceType === "template" && record.sourceRefId?.trim()) {
      void fetchTemplateById(record.sourceRefId.trim()).then(
        () => {
          if (!cancelled) setSourceMissing(false);
        },
        () => {
          if (!cancelled) setSourceMissing(true);
        }
      );
      return () => {
        cancelled = true;
      };
    }
    if (record.sourceType === "saved_result" && record.sourceRefId?.trim()) {
      setSourceMissing(getSavedResult(record.sourceRefId.trim()) == null);
      return;
    }
    setSourceMissing(null);
    return undefined;
  }, [record.sourceType, record.sourceRefId]);

  const persistFields = useCallback(() => {
    updateAutomationRecord(record.id, {
      title,
      description: description.trim() || undefined,
      status
    });
    onRecordsMutated();
  }, [record.id, title, description, status, onRecordsMutated]);

  const handleStepEnabled = (stepId: string, enabled: boolean) => {
    const steps = record.steps.map((s) => (s.id === stepId ? { ...s, enabled } : s));
    updateAutomationRecord(record.id, { steps });
    onRecordsMutated();
  };

  const handleDelete = () => {
    if (!window.confirm(`${a.deleteConfirmTitle}\n\n${a.deleteConfirmBody}`)) return;
    deleteAutomationRecord(record.id);
    onRecordsMutated();
    onClose();
  };

  const handleCycleStatus = () => {
    const next = toggleAutomationStatus(record.id);
    if (next) setStatus(next.status);
    onRecordsMutated();
  };

  const promptOk = Boolean(record.prompt?.trim());
  const enabledN = countEnabledSteps(record.steps);

  const openReadonlyWorkbench = () => {
    navigate(`/workbench?automationId=${encodeURIComponent(record.id)}`);
  };

  const startNewTaskFromDraft = () => {
    const p = record.prompt?.trim();
    if (!p) return;
    navigate(
      `/workbench?q=${encodeURIComponent(p)}&fromAutomationId=${encodeURIComponent(record.id)}`
    );
  };

  return (
    <aside className="automation-detail-panel" aria-labelledby="automation-detail-title">
      <div className="automation-detail-panel__head">
        <h2 id="automation-detail-title" className="automation-detail-panel__h2">
          {a.detailTitle}
        </h2>
        <span className="automation-detail-panel__badge-offline" title={a.manualOnlyHint}>
          {a.notLiveBadge}
        </span>
      </div>

      <p className="text-muted text-xs mb-2" role="note">
        {a.cardConfigOnlyShort} · {a.notRunningHint}
      </p>

      <section className="automation-detail-panel__section">
        <h3 className="automation-detail-panel__h3">{a.detailStatusExplainTitle}</h3>
        <p className="text-sm mb-0">{statusMeaning(u, status)}</p>
      </section>

      <section className="automation-detail-panel__section">
        <h3 className="automation-detail-panel__h3">{a.detailManualStartTitle}</h3>
        <p className="text-sm text-muted mb-0">{a.detailManualStartBody}</p>
      </section>

      {sourceMissing === true ? (
        <p className="automation-detail-panel__warn text-sm" role="status">
          {a.sourceMissing}
        </p>
      ) : null}

      <div className="automation-detail-panel__field">
        <label className="form-label" htmlFor="auto-detail-title">
          {a.fieldTitle}
        </label>
        <Input
          id="auto-detail-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => persistFields()}
        />
      </div>

      <div className="automation-detail-panel__field">
        <label className="form-label" htmlFor="auto-detail-desc">
          {a.fieldDescription}
        </label>
        <Textarea
          id="auto-detail-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => persistFields()}
        />
      </div>

      <div className="automation-detail-panel__field">
        <span className="form-label">{a.fieldSource}</span>
        <p className="text-sm mb-0">{sourceLabel(u, record)}</p>
        {record.sourceRefId ? (
          <p className="text-muted text-xs mono-block mb-0">{record.sourceRefId}</p>
        ) : null}
        {record.sourceType !== "manual" ? (
          <p className="text-muted text-xs mb-0">
            {a.sourceStatusLabel}：
            {sourceMissing === null
              ? "—"
              : sourceMissing
                ? a.sourceStatusMissingShort
                : a.sourceStatusOk}
          </p>
        ) : null}
      </div>

      <div className="automation-detail-panel__field">
        <span className="form-label">{a.fieldTrigger}</span>
        <p className="text-sm mb-0">{triggerLabel(u, record)}</p>
        <p className="text-muted text-xs mb-0">{a.triggerReservedHint}</p>
      </div>

      <div className="automation-detail-panel__field">
        <label className="form-label" htmlFor="auto-detail-status">
          {a.fieldStatus}
        </label>
        <select
          id="auto-detail-status"
          className="ui-select"
          value={status}
          onChange={(e) => {
            const v = e.target.value as AutomationStatus;
            setStatus(v);
            updateAutomationRecord(record.id, { status: v });
            onRecordsMutated();
          }}
        >
          <option value="draft">{a.statusDraft}</option>
          <option value="ready">{a.statusReady}</option>
          <option value="paused">{a.statusPaused}</option>
        </select>
        <Button type="button" variant="ghost" className="text-sm mt-1" onClick={() => handleCycleStatus()}>
          {a.cycleStatus}
        </Button>
      </div>

      <div className="automation-detail-panel__field">
        <span className="form-label">{a.detailSteps}</span>
        <p className="text-sm mb-1">{a.detailStepStatsLine(record.steps.length, enabledN)}</p>
        {record.prompt?.trim() ? (
          <div>
            <span className="form-label">{a.fieldPrompt}</span>
            <pre className="automation-detail-panel__pre mono-block text-sm">{record.prompt}</pre>
          </div>
        ) : (
          <p className="text-muted text-sm mb-0">{a.newTaskNeedsPrompt}</p>
        )}
        {record.steps.length === 0 ? (
          <p className="text-muted text-sm mb-0">{a.stepsEmptyHint}</p>
        ) : (
          <ul className="automation-detail-panel__steps">
            {record.steps.map((s) => (
              <li key={s.id} className="automation-detail-panel__step">
                <label className="flex items-center gap-2 flex-wrap">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => handleStepEnabled(s.id, e.target.checked)}
                  />
                  <span className="text-sm">{displayStepTitle(u, s)}</span>
                  <span className="text-muted text-xs">({stepKindLabel(u, s.kind)})</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="automation-detail-panel__actions automation-detail-panel__actions--primary">
        <Button type="button" variant="primary" onClick={openReadonlyWorkbench}>
          {a.openInWorkbench}
        </Button>
        <p className="text-muted text-xs mb-0 w-full">{a.openInWorkbenchHint}</p>
        <Button type="button" variant="primary" onClick={startNewTaskFromDraft} disabled={!promptOk}>
          {a.newTaskFromAutomation}
        </Button>
        <p className="text-muted text-xs mb-0 w-full">{promptOk ? a.newTaskFromAutomationHint : a.newTaskNeedsPrompt}</p>
        <Button type="button" variant="secondary" onClick={handleDelete}>
          {a.delete}
        </Button>
      </div>
      <p className="text-muted text-xs mb-0">{a.manualOnlyHint}</p>
    </aside>
  );
}
