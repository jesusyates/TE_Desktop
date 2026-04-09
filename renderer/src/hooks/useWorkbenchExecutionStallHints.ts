import { useEffect, useRef, useState } from "react";
import type { ExecutionStatus } from "../execution/session/execution";
import { isExecutionTerminal } from "../execution/session/execution";

/** D-7-6H v1：较长处理中提示（无复杂死锁检测） */
export const WORKBENCH_LONG_RUN_MS = 45_000;
/** D-7-6H v1：长时间无活动阈值（仅时间阈值） */
export const WORKBENCH_STALL_MS = 120_000;

export type WorkbenchStallHints = {
  longRunning: boolean;
  stalled: boolean;
};

/**
 * 在会话进行态下，根据「日志 / 步骤 / 结果 / 步骤指针」等指纹是否变化刷新空闲计时；
 * 超过阈值给出文案提示（父组件绑 i18n）。
 */
export function useWorkbenchExecutionStallHints(
  status: ExecutionStatus,
  activityFingerprint: string
): WorkbenchStallHints {
  const lastBumpRef = useRef(Date.now());
  const [hints, setHints] = useState<WorkbenchStallHints>({ longRunning: false, stalled: false });

  const inProgress = !isExecutionTerminal(status) && status !== "idle";

  useEffect(() => {
    if (!inProgress) {
      lastBumpRef.current = Date.now();
      setHints({ longRunning: false, stalled: false });
      return;
    }
    lastBumpRef.current = Date.now();
    setHints({ longRunning: false, stalled: false });
  }, [inProgress, status, activityFingerprint]);

  useEffect(() => {
    if (!inProgress) return;
    const tick = () => {
      const elapsed = Date.now() - lastBumpRef.current;
      const stalled = elapsed >= WORKBENCH_STALL_MS;
      const longRunning = elapsed >= WORKBENCH_LONG_RUN_MS && !stalled;
      setHints({ longRunning, stalled });
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => clearInterval(id);
  }, [inProgress, activityFingerprint]);

  return hints;
}
