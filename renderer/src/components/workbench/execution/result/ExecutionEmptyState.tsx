import { useUiStrings } from "../../../../i18n/useUiStrings";

/** idle 空态：仅展示，不触发任何执行动作 */
export const ExecutionEmptyState = () => {
  const u = useUiStrings();
  const x = u.console.executionResult;
  return (
    <div className="execution-empty-state">
      <p className="execution-empty-state__title">{x.emptyTitle}</p>
      <p className="execution-empty-state__lead text-muted text-sm">{x.emptyLead}</p>
    </div>
  );
};
