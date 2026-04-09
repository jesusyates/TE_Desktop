/**
 * D-7-4H：ViewModel 公共出口（新 UI 应从此处取 VM 类型与 mapper）。
 */

export type {
  ExecutionStepVM,
  HistoryItemVM,
  HistoryItemVMSource,
  ResultVM,
  ResultVMKind,
  TaskVM,
  TaskVMSource
} from "./types";
export {
  mapExecutionStepsToStepVMs,
  mapExecutionTaskResultToResultVM,
  mapExecutionTaskToTaskVM,
  mapHistoryEntryToHistoryItemVM,
  mapResultPackageToResultVM,
  mapTaskResultToResultVM,
  mapUnknownToResultVM,
  mapWorkbenchTimelineToTaskVM,
  serializeExecutionLogsForDisplay
} from "./mappers";
