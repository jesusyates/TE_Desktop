import type { UiCatalog } from "../../../i18n/uiCatalog";
import type { AutomationRecord } from "../automationTypes";
import { Button } from "../../../components/ui/Button";
import { countEnabledSteps } from "../automationStepDisplay";

export type AutomationCardProps = {
  u: UiCatalog;
  record: AutomationRecord;
  formattedUpdatedAt: string;
  selected?: boolean;
  onOpenDetail: () => void;
  onDelete: () => void;
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

function statusLabel(u: UiCatalog, record: AutomationRecord): string {
  switch (record.status) {
    case "ready":
      return u.automation.statusReady;
    case "paused":
      return u.automation.statusPaused;
    default:
      return u.automation.statusDraft;
  }
}

function statusMeaning(u: UiCatalog, record: AutomationRecord): string {
  switch (record.status) {
    case "ready":
      return u.automation.readyMeaning;
    case "paused":
      return u.automation.pausedMeaning;
    default:
      return u.automation.draftMeaning;
  }
}

export function AutomationCard({
  u,
  record,
  formattedUpdatedAt,
  selected = false,
  onOpenDetail,
  onDelete
}: AutomationCardProps) {
  const a = u.automation;
  const enabledN = countEnabledSteps(record.steps);
  const stepLine =
    record.steps.length <= 0
      ? a.cardNoStepsLabel
      : a.cardStepsSummary(record.steps.length, enabledN);

  return (
    <li className={"automation-card" + (selected ? " automation-card--selected" : "")}>
      <div className="automation-card__head">
        <h3 className="automation-card__title">{record.title.trim() || "—"}</h3>
        <span
          className={`automation-card__badge automation-card__badge--${record.status}`}
          title={`${statusMeaning(u, record)} ${a.notRunningHint}`}
        >
          {statusLabel(u, record)}
        </span>
      </div>
      <p className="automation-card__weak-hint text-muted text-xs mb-1" title={a.manualOnlyHint}>
        {a.cardConfigOnlyShort} · {a.notRunningHint}
      </p>
      <p className="automation-card__step-line text-sm mb-1">{stepLine}</p>
      <dl className="automation-card__meta text-muted text-sm">
        <div>
          <dt>{a.detailSource}</dt>
          <dd>{sourceLabel(u, record)}</dd>
        </div>
        <div>
          <dt>{a.detailTrigger}</dt>
          <dd>{triggerLabel(u, record)}</dd>
        </div>
        <div>
          <dt>{a.cardUpdated}</dt>
          <dd>{formattedUpdatedAt}</dd>
        </div>
        <div>
          <dt>{a.cardStepCount}</dt>
          <dd>{record.steps.length}</dd>
        </div>
      </dl>
      <div className="automation-card__actions">
        <Button type="button" variant="primary" onClick={onOpenDetail}>
          {a.openDetail}
        </Button>
        <Button type="button" variant="secondary" onClick={onDelete}>
          {a.delete}
        </Button>
      </div>
    </li>
  );
}
