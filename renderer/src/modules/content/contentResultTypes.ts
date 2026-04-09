/**
 * D-5-8：Result System 第一版 — content 分支。
 * D-5-9 可与 computer 结果统一为联合类型。
 */
import type { ResultSource } from "../result/resultTypes";

export type ContentExecutionResult = {
  type: "content";
  action: string;
  title: string;
  body: string;
  summary?: string;
  stepCount?: number;
  durationMs?: number;
  /** F-3：与 TaskResult.resultSource 对齐 */
  resultSource?: ResultSource;
  metadata?: Record<string, unknown>;
};

/** D-5-8：预留 computer 结果形态，先占位 */
export type ComputerResultLike = {
  type: "computer";
  summary?: string;
  metadata?: Record<string, unknown>;
};
