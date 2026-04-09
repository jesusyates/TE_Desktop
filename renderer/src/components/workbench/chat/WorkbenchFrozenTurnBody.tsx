import {
  turnFrozenForDisplay,
  type WorkbenchExecutionSourceV1,
  type WorkbenchUiTurn
} from "../../../services/workbenchUiPersistence";
import { ControllerPlanTimeline } from "./ControllerPlanTimeline";
import { WorkbenchSourceStrip } from "./WorkbenchSourceStrip";
import { toUserFacingExecutionError } from "../../../services/userFacingExecutionMessage";
import { useUiStrings } from "../../../i18n/useUiStrings";
import {
  isWorkbenchLikelyNetworkError,
  isWorkbenchLikelyTimeoutError
} from "../../../modules/workbench/workbenchErrorClassify";
import { isMockPlaceholderFrozenFields } from "../../../modules/result/mockResultUi";

type Props = {
  turn: WorkbenchUiTurn;
};

/**
 * D-7-5T：单条 turn 的冻结结果区（与 prompt 绑定的静态展示，不再走 session 流）。
 * D-7-6H：终态可读标题 + 用户向错误文案 + 网络/超时补充行。
 */
const emptyExecutionSourceStrip = (): WorkbenchExecutionSourceV1 => ({
  usedTemplate: false,
  usedMemory: false,
  usedLocalRuntime: false
});

export const WorkbenchFrozenTurnBody = ({ turn }: Props) => {
  const u = useUiStrings();
  const f = turnFrozenForDisplay(turn);
  if (!f) return null;

  const sourceStrip =
    turn.executionSource != null || turn.routerDecision != null
      ? turn.executionSource ?? emptyExecutionSourceStrip()
      : null;

  const rawErr = (f.errorMessage ?? turn.error ?? "").trim();
  const userFacingErr = rawErr ? toUserFacingExecutionError(rawErr, rawErr) : "";

  if (f.status === "error") {
    const net = isWorkbenchLikelyNetworkError(rawErr);
    const timeout = isWorkbenchLikelyTimeoutError(rawErr);
    return (
      <div className="workbench-conversation__assistant" role="region" aria-label="执行错误">
        {sourceStrip ? (
          <WorkbenchSourceStrip source={sourceStrip} routerDecision={turn.routerDecision ?? null} />
        ) : null}
        {turn.controllerPlan ? (
          <ControllerPlanTimeline
            plan={turn.controllerPlan}
            alignment={turn.coreControllerAlignment ?? null}
            routerDecision={turn.routerDecision ?? null}
          />
        ) : null}
        <h3 className="workbench-frozen-turn__status-title workbench-frozen-turn__status-title--error">
          {u.workbench.turnStatus.errorTitle}
        </h3>
        <p className="text-danger text-sm text-pre-wrap">
          {userFacingErr.trim() || u.common.genericExecFail}
        </p>
        {net ? (
          <p className="workbench-frozen-turn__hint text-muted text-sm mb-0" role="note">
            {u.workbench.turnStatus.errorNetworkHint}
          </p>
        ) : null}
        {timeout && !net ? (
          <p className="workbench-frozen-turn__hint text-muted text-sm mb-0" role="note">
            {u.workbench.turnStatus.errorTimeoutHint}
          </p>
        ) : null}
      </div>
    );
  }

  if (f.status === "stopped") {
    return (
      <div className="workbench-conversation__assistant" role="region" aria-label="已停止">
        {sourceStrip ? (
          <WorkbenchSourceStrip source={sourceStrip} routerDecision={turn.routerDecision ?? null} />
        ) : null}
        {turn.controllerPlan ? (
          <ControllerPlanTimeline
            plan={turn.controllerPlan}
            alignment={turn.coreControllerAlignment ?? null}
            routerDecision={turn.routerDecision ?? null}
          />
        ) : null}
        <h3 className="workbench-frozen-turn__status-title workbench-frozen-turn__status-title--muted">
          {u.workbench.turnStatus.stoppedTitle}
        </h3>
        <p className="text-muted text-sm text-pre-wrap">
          {u.workbench.turnStatus.stoppedLead}
        </p>
      </div>
    );
  }

  const isMockSuccess =
    f.status === "success" &&
    (f.isMockPlaceholder === true ||
      (f.isMockPlaceholder == null &&
        isMockPlaceholderFrozenFields(f.resultKind, f.resultTitle, f.resultBody)));

  if (isMockSuccess) {
    return (
      <div className="workbench-conversation__assistant" role="region" aria-label="模拟结果">
        {sourceStrip ? (
          <WorkbenchSourceStrip source={sourceStrip} routerDecision={turn.routerDecision ?? null} />
        ) : null}
        {turn.controllerPlan ? (
          <ControllerPlanTimeline
            plan={turn.controllerPlan}
            alignment={turn.coreControllerAlignment ?? null}
            routerDecision={turn.routerDecision ?? null}
          />
        ) : null}
        <p className="workbench-mock-result-banner" role="status">
          {u.workbench.mockResultNotice}
        </p>
        <article className="execution-result-card execution-result-card--conversational">
          <h4 className="execution-result-card__title">{f.resultTitle?.trim() || "结果"}</h4>
          <p className="execution-result-card__body text-pre-wrap whitespace-pre-wrap">
            {f.resultBody?.trim() || "（无正文摘要）"}
          </p>
        </article>
      </div>
    );
  }

  return (
    <div className="workbench-conversation__assistant" role="region" aria-label="任务结果">
      {sourceStrip ? (
        <WorkbenchSourceStrip source={sourceStrip} routerDecision={turn.routerDecision ?? null} />
      ) : null}
      {turn.controllerPlan ? (
        <ControllerPlanTimeline
          plan={turn.controllerPlan}
          alignment={turn.coreControllerAlignment ?? null}
          routerDecision={turn.routerDecision ?? null}
        />
      ) : null}
      <h3 className="workbench-frozen-turn__status-title workbench-frozen-turn__status-title--success">
        {u.workbench.turnStatus.successTitle}
      </h3>
      <article className="execution-result-card execution-result-card--conversational">
        <h4 className="execution-result-card__title">{f.resultTitle?.trim() || "结果"}</h4>
        <p className="execution-result-card__body text-pre-wrap whitespace-pre-wrap">
          {f.resultBody?.trim() || "（无正文摘要）"}
        </p>
      </article>
    </div>
  );
};
