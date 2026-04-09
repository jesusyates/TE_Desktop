import { useEffect, useMemo, useRef, useState } from "react";
import type { ExecutionStatus } from "../../../../execution/session/execution";
import { adaptLogs } from "../../../../execution/session/adapters";
import { useMockExecutionLogStream, type MockLogLine } from "../../../../execution/session/useMockExecutionLogStream";
import { useUiStrings } from "../../../../i18n/useUiStrings";

type Props = {
  status: ExecutionStatus;
  /** 事件流原始 logs；非空时优先展示适配后的真实日志 */
  rawLogs?: unknown[] | null;
};

function useProgressiveAdaptedLogs(source: MockLogLine[], enabled: boolean, status: ExecutionStatus) {
  const [lines, setLines] = useState<MockLogLine[]>([]);
  const revealedRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const terminal = status === "success" || status === "error" || status === "stopped";
  const sourceSig = source.map((l) => l.id).join("\0");

  useEffect(() => {
    const src = sourceRef.current;
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!enabled) {
      revealedRef.current = 0;
      setLines([]);
      return;
    }

    if (terminal) {
      revealedRef.current = src.length;
      setLines(src);
      return;
    }

    if (src.length === 0) {
      revealedRef.current = 0;
      setLines([]);
      return;
    }

    if (revealedRef.current > src.length) {
      revealedRef.current = src.length;
    }

    setLines(src.slice(0, revealedRef.current));

    if (revealedRef.current >= src.length) {
      return;
    }

    let cancelled = false;
    const revealNext = () => {
      if (cancelled) return;
      const next = sourceRef.current;
      revealedRef.current += 1;
      setLines(next.slice(0, revealedRef.current));
      if (revealedRef.current < next.length) {
        const ms = 400 + Math.floor(Math.random() * 350);
        timeoutRef.current = window.setTimeout(revealNext, ms);
      }
    };
    const ms = 400 + Math.floor(Math.random() * 350);
    timeoutRef.current = window.setTimeout(revealNext, ms);

    return () => {
      cancelled = true;
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, terminal, sourceSig]);

  return lines;
}

/**
 * 执行过程日志：优先 eventStream.logs（适配 + 渐进展示），否则 mock 流。
 */
export const ExecutionLogPreview = ({ status, rawLogs }: Props) => {
  const u = useUiStrings();
  const scrollRef = useRef<HTMLDivElement>(null);

  const strings = useMemo(
    () => ({
      analyzing: u.console.executionResult.mockLogAnalyzing,
      selectingTools: u.console.executionResult.mockLogSelectingTools,
      executingStepTpl: u.console.executionResult.mockLogExecutingStep,
      aggregating: u.console.executionResult.mockLogAggregating,
      stopping: u.console.executionResult.mockLogStopping
    }),
    [u]
  );

  const hasRealLogs = Array.isArray(rawLogs) && rawLogs.length > 0;
  const adaptedReal = useMemo(() => (Array.isArray(rawLogs) ? adaptLogs(rawLogs) : []), [rawLogs]);
  const mockLines = useMockExecutionLogStream(status, strings, { disabled: hasRealLogs });
  const progressiveReal = useProgressiveAdaptedLogs(adaptedReal, hasRealLogs, status);
  const lines = hasRealLogs ? progressiveReal : mockLines;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [lines]);

  return (
    <div className="execution-log-preview" aria-live="polite" aria-relevant="additions">
      <div ref={scrollRef} className="execution-log-preview__scroll" tabIndex={0}>
        <ul className="execution-log-preview__list">
          {lines.map((line) => (
            <li key={line.id} className="execution-log-item">
              {line.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
