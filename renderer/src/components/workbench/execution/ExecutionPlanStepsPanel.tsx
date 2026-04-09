import { useState } from "react";
import type {
  ExecutionPlan,
  ExecutionPlanStepStatus,
  ExecutionPlanStepType
} from "../../../modules/workbench/execution/executionPlanTypes";
import {
  LR_LABEL_GROUP,
  lrSemanticsSuffix,
  lrStepGroupTitle
} from "../../../modules/workbench/execution/localRuntimeNomenclature.zh";
import type { ResultSource, TaskResult } from "../../../modules/result/resultTypes";
import { resultSourceLabelZh } from "../../../modules/result/resultProvenanceUi";
import "./execution-plan-steps.css";

function stepTypeLabel(t: ExecutionPlanStepType): string {
  switch (t) {
    case "generate":
      return "生成";
    case "summarize":
      return "总结";
    case "capability":
      return "能力";
    case "human_confirm":
      return "待确认";
    case "local_scan":
      return lrStepGroupTitle("local_scan");
    case "local_read":
      return lrStepGroupTitle("local_read");
    case "local_text_transform":
      return lrStepGroupTitle("local_text_transform");
    case "local_file_operation":
      return `${LR_LABEL_GROUP} · 本地文件`;
    default:
      return t;
  }
}

function stepStatusLabel(s: ExecutionPlanStepStatus): string {
  switch (s) {
    case "pending":
      return "待开始";
    case "running":
      return "执行中";
    case "waiting_confirm":
      return "等待确认";
    case "success":
      return "已完成";
    case "error":
      return "失败";
    case "stopped":
      return "已停止";
    default:
      return s;
  }
}

export type ExecutionPlanStepsPanelProps = {
  plan: ExecutionPlan | null;
  currentStepIndex: number;
  stepResults: Record<string, TaskResult>;
};

export function ExecutionPlanStepsPanel({ plan, currentStepIndex, stepResults }: ExecutionPlanStepsPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!plan?.steps.length) return null;

  return (
    <div className="execution-plan-steps" role="region" aria-label="执行步骤">
      <div className="execution-plan-steps__header">执行流水线</div>
      <ol className="execution-plan-steps__list">
        {plan.steps.map((st, i) => {
          const isCurrent = i === currentStepIndex;
          const isPending = st.status === "pending";
          const isSuccess = st.status === "success";
          const isError = st.status === "error";
          const isWaitingConfirm = st.status === "waiting_confirm";
          const isStoppedStep = st.status === "stopped";
          const isRunning = st.status === "running";
          const tr = stepResults[st.stepId];
          const body =
            tr?.kind === "content"
              ? (tr.body || tr.summary || "").trim()
              : (st.output?.body ?? st.output?.summary ?? "").toString().trim();
          const capSummary =
            st.type === "capability" && st.status === "success" && tr?.kind === "content"
              ? (tr.summary || "").trim()
              : "";
          const isLocalStep =
            st.type === "local_scan" ||
            st.type === "local_read" ||
            st.type === "local_text_transform" ||
            st.type === "local_file_operation";
          const typeClass =
            st.type === "summarize"
              ? " execution-plan-steps__type--summarize"
              : st.type === "human_confirm"
                ? " execution-plan-steps__type--human"
                : st.type === "capability"
                  ? " execution-plan-steps__type--capability"
                  : isLocalStep
                    ? " execution-plan-steps__type--local"
                    : " execution-plan-steps__type--generate";
          return (
            <li
              key={st.stepId}
              className={
                "execution-plan-steps__item" +
                (isCurrent ? " execution-plan-steps__item--current" : "") +
                (isSuccess ? " execution-plan-steps__item--done" : "") +
                (isError ? " execution-plan-steps__item--error" : "") +
                (isPending ? " execution-plan-steps__item--pending" : "") +
                (isWaitingConfirm ? " execution-plan-steps__item--waiting" : "") +
                (isStoppedStep ? " execution-plan-steps__item--stopped" : "") +
                (isRunning ? " execution-plan-steps__item--running" : "")
              }
            >
              <div className="execution-plan-steps__row">
                <span className="execution-plan-steps__idx">{i + 1}</span>
                <div className="execution-plan-steps__main">
                  <div className="execution-plan-steps__title-row">
                    <span className={"execution-plan-steps__type" + typeClass}>{stepTypeLabel(st.type)}</span>
                    <span className="execution-plan-steps__title">{st.title}</span>
                    <span className="execution-plan-steps__state">{stepStatusLabel(st.status)}</span>
                  </div>
                  {st.description ? (
                    <p className="execution-plan-steps__desc">{st.description}</p>
                  ) : null}
                  {isLocalStep ? (
                    <p className="execution-plan-steps__local-note text-muted text-sm mb-0">
                      {lrSemanticsSuffix()}
                    </p>
                  ) : null}
                  {st.output && "source" in st.output && st.status === "success" ? (
                    <p className="execution-plan-steps__out-source">
                      本步来源：<span className="execution-plan-steps__out-source-tag">{resultSourceLabelZh(st.output.source as ResultSource)}</span>
                    </p>
                  ) : null}
                  {st.type === "capability" ? (
                    <p className="execution-plan-steps__cap-meta">
                      <span className="execution-plan-steps__cap-k">{String(st.input.capabilityType ?? "")}</span>
                      <span className="execution-plan-steps__cap-sep"> · </span>
                      <code className="execution-plan-steps__cap-op">{String(st.input.operation ?? "")}</code>
                    </p>
                  ) : null}
                  {capSummary ? (
                    <p className="execution-plan-steps__cap-out-preview" title={capSummary}>
                      输出摘要：{capSummary.length > 120 ? `${capSummary.slice(0, 119)}…` : capSummary}
                    </p>
                  ) : null}
                  {body ? (
                    <button
                      type="button"
                      className="execution-plan-steps__toggle"
                      onClick={() => setOpenId((x) => (x === st.stepId ? null : st.stepId))}
                      aria-expanded={openId === st.stepId}
                    >
                      {openId === st.stepId ? "隐藏输出" : "查看输出"}
                    </button>
                  ) : null}
                  {openId === st.stepId && body ? (
                    <pre className="execution-plan-steps__output" tabIndex={0}>
                      {body}
                    </pre>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
