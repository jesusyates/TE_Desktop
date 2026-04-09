import type { ExecutionStatus } from "../../../execution/session/execution";
import type { ResolvedTaskMode } from "../../../types/taskMode";
import type { TaskVM } from "../../../viewmodels/types";
import { ExecutionStatusBadge } from "../execution/ExecutionStatusBadge";

export type ExecutionBlockHeaderProps = {
  /** D-7-4H：若提供则优先用于标题与任务号展示 */
  taskVm?: TaskVM;
  prompt: string;
  status: ExecutionStatus;
  /** 完整 task id，组件内展示尾号 */
  currentTaskId: string;
  /** 可选时间文案（占位；后续可接 createdAt） */
  headerTimeLabel?: string;
  /** D-5-1：解析后的任务模式 */
  resolvedMode?: ResolvedTaskMode;
};

function modeLabel(m: ResolvedTaskMode): string {
  return m === "computer" ? "Computer" : "Content";
}

function taskIdTail(id: string): string {
  const t = id.trim();
  if (!t) return "";
  return t.length <= 12 ? t : `…${t.slice(-8)}`;
}

/**
 * Block 顶栏：任务卡-style，非聊天气泡。
 */
export const ExecutionBlockHeader = ({
  taskVm,
  prompt,
  status,
  currentTaskId,
  headerTimeLabel,
  resolvedMode = "content"
}: ExecutionBlockHeaderProps) => {
  const effectiveId = (taskVm?.id ?? currentTaskId).trim();
  const tail = taskIdTail(effectiveId);
  const displayPrompt = (taskVm?.prompt ?? prompt).trim() || "（无标题）";

  return (
    <header className="execution-block__header">
      <p className="execution-block__prompt">{displayPrompt}</p>
      <div className="execution-block__meta">
        <div className="execution-block__meta-item">
          <ExecutionStatusBadge status={status} />
        </div>
        <div className="execution-block__meta-item">
          <span className="execution-block__meta-label">模式</span>
          <span className="execution-block__mode-pill">{modeLabel(resolvedMode)}</span>
        </div>
        {tail ? (
          <div className="execution-block__meta-item">
            <span className="execution-block__meta-label">任务</span>
            <span className="mono-block" title={effectiveId}>
              {tail}
            </span>
          </div>
        ) : null}
        <div className="execution-block__meta-item">
          <span className="execution-block__meta-label">时间</span>
          <span>{headerTimeLabel?.trim() ? headerTimeLabel : "—"}</span>
        </div>
      </div>
    </header>
  );
};
