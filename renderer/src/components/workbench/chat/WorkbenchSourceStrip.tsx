import type { WorkbenchExecutionSourceV1 } from "../../../services/workbenchUiPersistence";
import type { RouterDecision } from "../../../modules/router/routerTypes";
import { useUiStrings } from "../../../i18n/useUiStrings";
import "./workbench-chat.css";

export function WorkbenchSourceStrip({
  source,
  routerDecision = null
}: {
  source: WorkbenchExecutionSourceV1;
  routerDecision?: RouterDecision | null;
}) {
  const c = useUiStrings().workbench.controller;
  const cell = (label: string, on: boolean) => (
    <span className={`workbench-source-strip__chip ${on ? "workbench-source-strip__chip--on" : ""}`}>
      {label}: {on ? c.stripOn : c.stripOff}
    </span>
  );
  return (
    <div className="workbench-source-strip text-sm" role="region" aria-label={c.stripTitle}>
      <span className="workbench-source-strip__head">{c.stripTitle}</span>
      <span className="workbench-source-strip__chips">
        {cell(c.stripTemplate, source.usedTemplate)}
        {cell(c.stripMemory, source.usedMemory)}
        {cell(c.stripLocal, source.usedLocalRuntime)}
      </span>
      <div className="workbench-source-strip__router-meta">
        <div className="workbench-source-strip__row source-strip__row text-xs text-muted mb-0">
          {c.routerModelLabel}：{routerDecision?.model ?? "—"}
        </div>
        <div className="workbench-source-strip__row source-strip__row text-xs text-muted mb-0">
          {c.routerLocationLabel}：
          {routerDecision?.executionMode === "local_only" ? c.routerLocal : c.routerCloud}
        </div>
      </div>
    </div>
  );
}
