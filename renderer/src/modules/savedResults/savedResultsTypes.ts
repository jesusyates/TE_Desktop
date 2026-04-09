import type { OutputTrust, ResultProvenance, ResultSource, TaskResult } from "../result/resultTypes";

export type SavedResultRecordV1 = {
  v: 1;
  id: string;
  title: string;
  prompt: string;
  body: string;
  summary?: string;
  /** 用户点击保存的时间 */
  savedAt: string;
  /** 任务完成时间（与结果包导出一致，可空） */
  completedAt?: string;
  /** 保存时的界面语言文案快照 */
  resultSourceDisplay: string;
  outputTrustDisplay: string;
  resultSources: ResultSource[];
  outputTrust: OutputTrust;
  /** 是否为包含本地执行全文的保存 */
  savedWithFullLocal: boolean;
};

const MAX_ITEMS = 300;

export { MAX_ITEMS };

/** 供工作台 / 结果区还原为统一 TaskResult（含 provenance，便于与现有信任 UI 对齐） */
export function savedRecordToTaskResult(r: SavedResultRecordV1): TaskResult {
  const distinct =
    r.resultSources.length > 0 ? [...r.resultSources] : ([missingSource()] as ResultSource[]);
  const primary = distinct[0] ?? missingSource();
  const authenticity: ResultProvenance["authenticity"] = distinct.includes("ai_result")
    ? distinct.some((s) => s === "mock" || s === "fallback")
      ? "mixed"
      : "ai_production"
    : "mixed";
  const provenance: ResultProvenance = {
    steps: [],
    distinctSources: distinct,
    authenticity
  };
  return {
    kind: "content",
    title: r.title,
    body: r.body,
    summary: r.summary,
    resultSource: primary,
    metadata: {
      resultProvenance: provenance,
      outputTrust: r.outputTrust,
      savedResultId: r.id,
      savedAt: r.savedAt
    }
  };
}

function missingSource(): ResultSource {
  return "fallback";
}
