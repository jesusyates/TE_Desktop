import type {
  ControllerAlignmentBundle,
  ControllerPlanV1,
  ControllerStepStatus
} from "../../../modules/controller";
import type { RouterDecision } from "../../../modules/router/routerTypes";
import { useUiStrings } from "../../../i18n/useUiStrings";
import "./workbench-chat.css";

function statusClass(st: ControllerStepStatus): string {
  switch (st) {
    case "pending":
      return "controller-plan-step__badge--pending";
    case "running":
      return "controller-plan-step__badge--running";
    case "success":
      return "controller-plan-step__badge--success";
    case "error":
      return "controller-plan-step__badge--error";
    default:
      return "controller-plan-step__badge--pending";
  }
}

export function ControllerPlanTimeline({
  plan,
  alignment = null,
  routerDecision = null
}: {
  plan: ControllerPlanV1;
  alignment?: ControllerAlignmentBundle | null;
  routerDecision?: RouterDecision | null;
}) {
  const c = useUiStrings().workbench.controller;
  const graphBinding =
    plan.graphBinding ?? (plan.graphReserved ? "reserved_executes_as_linear_pipeline" : "none");

  const classLabel = {
    content: c.classContent,
    research: c.classResearch,
    local: c.classLocal,
    mixed: c.classMixed,
    automation_reserved: c.classAutomationReserved
  }[plan.classification];

  const tierLabel = {
    simple: c.tierSimple,
    medium: c.tierMedium,
    complex: c.tierComplex
  }[plan.complexity];

  const stratLabel =
    plan.strategy === "direct"
      ? c.stratDirect
      : plan.strategy === "pipeline"
        ? c.stratPipeline
        : c.stratGraph;

  const stepStatusLabel = (st: ControllerStepStatus) => {
    switch (st) {
      case "pending":
        return c.statusPending;
      case "running":
        return c.statusRunning;
      case "success":
        return c.statusSuccess;
      case "error":
        return c.statusError;
      default:
        return st;
    }
  };

  return (
    <div className="controller-plan-timeline" role="region" aria-label={c.timelineTitle}>
      <div className="controller-plan-timeline__head">
        <h4 className="controller-plan-timeline__title">{c.timelineTitle}</h4>
        <p className="controller-plan-timeline__summary text-sm text-muted mb-0">
          {c.timelineSummary({
            classification: classLabel,
            complexity: tierLabel,
            risk: plan.riskLevel,
            strategy: stratLabel
          })}
        </p>
        {routerDecision?.model ? (
          <p className="controller-plan-timeline__router-strategy text-sm text-muted mb-0" role="note">
            {c.routerStrategyLine({ model: routerDecision.model, tier: tierLabel })}
          </p>
        ) : null}
        {plan.requiresUserConfirmation ? (
          <p className="controller-plan-timeline__confirm-hint text-sm mb-0" role="note">
            {c.suggestConfirm}
          </p>
        ) : null}
        {graphBinding === "reserved_executes_as_linear_pipeline" ? (
          <p className="controller-plan-timeline__graph-binding text-sm text-muted mb-0" role="note">
            {c.graphBindingNote}
          </p>
        ) : null}
        {plan.templateProvenance ? (
          <p className="controller-plan-timeline__template text-sm mb-0" role="note">
            <span className="controller-plan-timeline__template-badge">{c.templatePlanBadge}</span>{" "}
            {c.templatePlanSummary({
              title: plan.templateProvenance.displayName,
              id: plan.templateProvenance.templateId,
              workflow: plan.templateProvenance.formalMeta.workflowType,
              market: plan.templateProvenance.formalMeta.market,
              locale: plan.templateProvenance.formalMeta.locale
            })}
          </p>
        ) : null}
        {alignment?.analyze || alignment?.plan ? (
          <p
            className={`controller-plan-timeline__core-align text-sm mb-0${
              (alignment.analyze && !alignment.analyze.aligned) || (alignment.plan && !alignment.plan.aligned)
                ? " controller-plan-timeline__core-align--warn"
                : ""
            }`}
            role="status"
          >
            {(() => {
              const da = (alignment.analyze?.diffs?.length ?? 0) + (alignment.plan?.diffs?.length ?? 0);
              const ok =
                (alignment.analyze == null || alignment.analyze.aligned) &&
                (alignment.plan == null || alignment.plan.aligned);
              return ok ? c.coreAlignmentOk : c.coreAlignmentDiff(da);
            })()}
          </p>
        ) : null}
      </div>
      <p className="controller-plan-timeline__explain text-sm text-pre-wrap">{plan.explanation}</p>
      <h5 className="controller-plan-timeline__steps-heading">{c.stepsHeading}</h5>
      <ol className="controller-plan-timeline__steps">
        {plan.steps.map((step) => (
          <li key={step.id} className="controller-plan-step">
            <div className="controller-plan-step__row">
              <span className={`controller-plan-step__badge ${statusClass(step.status)}`}>
                {stepStatusLabel(step.status)}
              </span>
              <span className="controller-plan-step__agent font-mono text-xs">{step.agent}</span>
            </div>
            <p className="controller-plan-step__purpose text-sm mb-1">{step.purpose}</p>
            <p className="controller-plan-step__source text-xs text-muted mb-0">
              {c.inputSource}: {step.inputSource}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
