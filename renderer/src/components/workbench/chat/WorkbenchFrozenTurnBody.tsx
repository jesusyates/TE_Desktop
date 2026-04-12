import {
  turnFrozenForDisplay,
  type WorkbenchUiTurn
} from "../../../services/workbenchUiPersistence";
import { useUiStrings } from "../../../i18n/useUiStrings";
import {
  isWorkbenchLikelyNetworkError,
  isWorkbenchLikelyTimeoutError
} from "../../../modules/workbench/workbenchErrorClassify";
import { isMockPlaceholderFrozenFields } from "../../../modules/result/mockResultUi";
import { buildFailureResultPresentation } from "../../../modules/result/failureResultPresentation";
import { sanitizeResultContent } from "../../../modules/result/sanitizeResultContent";

type Props = {
  turn: WorkbenchUiTurn;
};

const ENTRY_DEGRADED_LINE = "本次结果仅供参考。";

/**
 * D-7-5T：单条 turn 的冻结结果区（与 prompt 绑定的静态展示，不再走 session 流）。
 * 首页统一入口：不展示来源条、Controller、流水线等内部结构。
 */
export const WorkbenchFrozenTurnBody = ({ turn }: Props) => {
  const u = useUiStrings();
  const f = turnFrozenForDisplay(turn);
  if (!f) return null;

  const rawErr = (f.errorMessage ?? turn.error ?? "").trim();

  if (f.status === "error") {
    const failurePresentation = buildFailureResultPresentation({
      streamError: null,
      lastErrorMessage: rawErr,
      unifiedResult: undefined
    });
    const net = isWorkbenchLikelyNetworkError(rawErr);
    const timeout = isWorkbenchLikelyTimeoutError(rawErr);
    return (
      <div className="workbench-conversation__assistant" role="region" aria-label="执行错误">
        <p className="text-sm text-pre-wrap mb-1">这次没有成功，可以再试一次。</p>
        {import.meta.env.DEV ? (
          <details className="workbench-frozen-turn__technical mt-2">
            <summary className="cursor-pointer text-muted text-sm user-select-none">技术详情</summary>
            <div className="mt-2 text-muted text-sm">
              <p className="mb-1">{failurePresentation.title}</p>
              <p className="mb-1">{failurePresentation.primary}</p>
              <pre className="execution-error-card__dev-raw text-xs text-pre-wrap break-words mb-0 p-2">
                {rawErr || ""}
              </pre>
            </div>
          </details>
        ) : null}
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

  const rawTitle = (f.resultTitle ?? "").trim();
  const rawBody = (f.resultBody ?? "").trim();
  const titleForDisplay =
    sanitizeResultContent(rawTitle, { forTitle: true }).trim() || "结果";
  const bodyForDisplay = rawBody ? sanitizeResultContent(rawBody, {}) : "";

  if (isMockSuccess) {
    return (
      <div className="workbench-conversation__assistant" role="region" aria-label="任务结果">
        <p className="text-muted text-sm mb-2" role="status">
          {ENTRY_DEGRADED_LINE}
        </p>
        <article className="execution-result-card execution-result-card--conversational">
          <h4 className="execution-result-card__title">{titleForDisplay}</h4>
          <p className="execution-result-card__body text-pre-wrap whitespace-pre-wrap">
            {bodyForDisplay || "（无正文摘要）"}
          </p>
        </article>
      </div>
    );
  }

  return (
    <div className="workbench-conversation__assistant" role="region" aria-label="任务结果">
      <h3 className="workbench-frozen-turn__status-title workbench-frozen-turn__status-title--success">
        {u.workbench.turnStatus.successTitle}
      </h3>
      <article className="execution-result-card execution-result-card--conversational">
        <h4 className="execution-result-card__title">{titleForDisplay}</h4>
        <p className="execution-result-card__body text-pre-wrap whitespace-pre-wrap">
          {bodyForDisplay || "（无正文摘要）"}
        </p>
      </article>
    </div>
  );
};
