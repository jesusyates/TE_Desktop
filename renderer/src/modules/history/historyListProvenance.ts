import type { ExecutionHistoryMode, ExecutionHistoryStatus } from "../../services/history.api";
import type { OutputTrust, ResultSource } from "../result/resultTypes";

/**
 * J-1+：列表行无完整 TaskResult 时，由正式 status + mode 推导与 ResultPanel 一致的来源 / 可信度。
 */
export function deriveHistoryListProvenance(
  status: string,
  mode?: string
): { resultSource: ResultSource; outputTrust: OutputTrust } {
  const st = status as ExecutionHistoryStatus;
  const md = mode as ExecutionHistoryMode | undefined;
  if (st === "error") return { resultSource: "error", outputTrust: "error" };
  if (st === "stopped") return { resultSource: "fallback", outputTrust: "non_authentic" };
  if (md === "fallback") return { resultSource: "fallback", outputTrust: "non_authentic" };
  if (md === "local") return { resultSource: "mock", outputTrust: "non_authentic" };
  return { resultSource: "ai_result", outputTrust: "authentic" };
}
