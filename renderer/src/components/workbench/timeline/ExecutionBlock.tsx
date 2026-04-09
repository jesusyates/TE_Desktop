import type { ReactNode } from "react";
import type { ExecutionStatus } from "../../../execution/session/execution";
import type { ResolvedTaskMode } from "../../../types/taskMode";
import type { TaskVM } from "../../../viewmodels/types";
import { ExecutionBlockBody } from "./ExecutionBlockBody";
import { ExecutionBlockHeader } from "./ExecutionBlockHeader";

export type ExecutionBlockProps = {
  taskVm?: TaskVM;
  prompt: string;
  status: ExecutionStatus;
  currentTaskId: string;
  headerTimeLabel?: string;
  resolvedMode?: ResolvedTaskMode;
  children: ReactNode;
};

/**
 * 单任务时间线块：Header（prompt / 状态 / 元数据）+ Body（控制条、阶段、结果或回放）。
 */
export const ExecutionBlock = ({
  taskVm,
  prompt,
  status,
  currentTaskId,
  headerTimeLabel,
  resolvedMode,
  children
}: ExecutionBlockProps) => {
  return (
    <article className="execution-block" aria-label="当前执行任务">
      <ExecutionBlockHeader
        taskVm={taskVm}
        prompt={prompt}
        status={status}
        currentTaskId={currentTaskId}
        headerTimeLabel={headerTimeLabel}
        resolvedMode={resolvedMode}
      />
      <ExecutionBlockBody>{children}</ExecutionBlockBody>
    </article>
  );
};
