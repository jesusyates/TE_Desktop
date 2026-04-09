import { useEffect, useRef, useState } from "react";
import type { ExecutionStatus } from "./execution";

export type MockLogLine = { id: string; text: string };

export type MockLogStrings = {
  analyzing: string;
  selectingTools: string;
  executingStepTpl: string;
  aggregating: string;
  stopping: string;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatStep(tpl: string, n: number) {
  return tpl.replace(/\{n\}/g, String(n));
}

/**
 * 模拟「执行过程流」日志（仅前端定时追加，与 D-2-2 状态机只读对齐）。
 * running：每 400–800ms 追加一条；paused：停止追加；stopping：追加一条停止文案。
 */
export type MockLogStreamOptions = {
  /** 为 true 时不启动 mock 定时流（由真实 logs 接管）。 */
  disabled?: boolean;
};

export function useMockExecutionLogStream(
  status: ExecutionStatus,
  strings: MockLogStrings,
  options?: MockLogStreamOptions
) {
  const [lines, setLines] = useState<MockLogLine[]>([]);
  const stringsRef = useRef(strings);
  stringsRef.current = strings;

  const timeoutRef = useRef<number | null>(null);
  const counterRef = useRef(0);
  const stepRef = useRef(1);
  const stoppingPushedRef = useRef(false);

  const clearTimer = () => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    const s = stringsRef.current;

    if (options?.disabled) {
      clearTimer();
      setLines([]);
      counterRef.current = 0;
      stepRef.current = 1;
      stoppingPushedRef.current = false;
      return;
    }

    if (
      status === "idle" ||
      status === "validating" ||
      status === "queued" ||
      status === "success" ||
      status === "error"
    ) {
      clearTimer();
      setLines([]);
      counterRef.current = 0;
      stepRef.current = 1;
      stoppingPushedRef.current = false;
      return;
    }

    if (status === "stopped") {
      clearTimer();
      setLines([]);
      counterRef.current = 0;
      stepRef.current = 1;
      stoppingPushedRef.current = false;
      return;
    }

    if (status === "stopping") {
      clearTimer();
      if (!stoppingPushedRef.current) {
        stoppingPushedRef.current = true;
        setLines((prev) => [...prev, { id: makeId(), text: s.stopping }]);
      }
      return () => clearTimer();
    }

    if (status === "paused") {
      clearTimer();
      return () => clearTimer();
    }

    // running：每条间隔 400–800ms（首条也经同间隔调度，避免瞬间刷满）
    clearTimer();
    stoppingPushedRef.current = false;

    const tick = () => {
      const str = stringsRef.current;
      const i = counterRef.current++;
      const mod = i % 4;
      let text: string;
      if (mod === 0) text = str.analyzing;
      else if (mod === 1) text = str.selectingTools;
      else if (mod === 2) text = formatStep(str.executingStepTpl, stepRef.current++);
      else text = str.aggregating;

      setLines((prev) => [...prev, { id: makeId(), text }]);
      const ms = 400 + Math.floor(Math.random() * 400);
      timeoutRef.current = window.setTimeout(tick, ms);
    };

    const firstDelay = 400 + Math.floor(Math.random() * 400);
    timeoutRef.current = window.setTimeout(tick, firstDelay);
    return () => clearTimer();
  }, [status, options?.disabled]);

  return lines;
}
