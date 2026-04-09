import type { ResultProvenance, TaskResult } from "./resultTypes";

/**
 * Local Runtime 收口：正式历史 / 工作台落盘是否保留全文正文。
 * 本地执行结果仅摘要进入历史与冻结展示；会话进行中内存仍可有全文。
 */
export function isLocalRuntimeSummaryOnlyForPersistence(r: TaskResult | null): boolean {
  if (!r || r.kind !== "content") return false;
  if (r.resultSource === "local_runtime" || r.action === "local_runtime") return true;
  if (r.action === "pipeline_aggregate") {
    const prov = r.metadata?.resultProvenance as ResultProvenance | undefined;
    const d = prov?.distinctSources;
    if (d?.length && d.every((s) => s === "local_runtime")) return true;
  }
  return false;
}
