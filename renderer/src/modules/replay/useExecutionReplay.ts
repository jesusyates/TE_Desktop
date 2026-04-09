import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExecutionStep } from "../../execution/execution.types";
import { adaptLogs, adaptSteps } from "../../execution/session/adapters";
import type { MockLogLine } from "../../execution/session/useMockExecutionLogStream";

/** 轮询间隔约束：200~500ms */
const TICK_MS = 320;

function clamp01(p: number): number {
  if (Number.isNaN(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

export type UseExecutionReplayReturn = {
  replayLogs: MockLogLine[];
  replaySteps: ExecutionStep[];
  progress: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (p: number) => void;
};

type UseExecutionReplayOptions = {
  resetKey: string;
};

/**
 * D-2-6：基于快照 logs/steps 的回放（不请求 API、不写 session）。
 */
export function useExecutionReplay(
  rawLogs: unknown[] | null | undefined,
  rawSteps: unknown[] | null | undefined,
  enabled: boolean,
  options: UseExecutionReplayOptions
): UseExecutionReplayReturn {
  const { resetKey } = options;
  const logs = Array.isArray(rawLogs) ? rawLogs : [];
  const steps = Array.isArray(rawSteps) ? rawSteps : [];

  const adaptedLogs = useMemo(() => adaptLogs(logs), [logs]);
  const adaptedSteps = useMemo(() => adaptSteps(steps), [steps]);

  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const tickRef = useRef<number | null>(null);

  const totalTicks = Math.max(adaptedLogs.length, adaptedSteps.length, 1);
  const stepDelta = useMemo(() => 1 / totalTicks, [totalTicks]);

  useEffect(() => {
    if (!enabled) return;
    setProgress(0);
    setIsPlaying(false);
  }, [resetKey, enabled]);

  useEffect(() => {
    if (!enabled || !isPlaying) {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    tickRef.current = window.setInterval(() => {
      setProgress((p) => {
        const next = clamp01(p + stepDelta);
        if (next >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return next;
      });
    }, TICK_MS);

    return () => {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [enabled, isPlaying, stepDelta]);

  const { replayLogs, replaySteps } = useMemo(() => {
    const nL = adaptedLogs.length;
    const nS = adaptedSteps.length;
    const p = clamp01(progress);
    const logN = nL === 0 ? 0 : Math.min(nL, Math.max(0, Math.ceil(p * nL - 1e-9)));
    const stepN = nS === 0 ? 0 : Math.min(nS, Math.max(0, Math.ceil(p * nS - 1e-9)));
    return {
      replayLogs: adaptedLogs.slice(0, logN),
      replaySteps: adaptedSteps.slice(0, stepN)
    };
  }, [adaptedLogs, adaptedSteps, progress]);

  const play = useCallback(() => {
    setIsPlaying(true);
    setProgress((p) => (p >= 1 ? 0 : p));
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const seek = useCallback((p: number) => {
    setIsPlaying(false);
    setProgress(clamp01(p));
  }, []);

  return {
    replayLogs,
    replaySteps,
    progress: clamp01(progress),
    isPlaying,
    play,
    pause,
    seek
  };
}
