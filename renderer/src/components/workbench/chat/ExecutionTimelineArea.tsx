import { forwardRef, type ReactNode } from "react";
import "./workbench-chat.css";
import "../timeline/execution-block.css";

type Props = {
  children: ReactNode;
};

/**
 * 上部可滚动时间线区：承载阶段轴、结果/回放等执行内容（D-3-1 先块状挂载，D-3-2 再 block 化）。
 * D-7-6K：forwardRef 供 Workbench 父级控制 scrollTop。
 */
export const ExecutionTimelineArea = forwardRef<HTMLDivElement, Props>(function ExecutionTimelineArea(
  { children },
  ref
) {
  return (
    <div ref={ref} className="execution-timeline-area">
      {children}
    </div>
  );
});
