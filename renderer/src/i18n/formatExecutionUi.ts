import type { OutputTrust, ResultSource } from "../modules/result/resultTypes";
import type { TaskVMSource } from "../viewmodels/types";
import type { UiCatalog } from "./uiCatalog";

/** J-1：账户 execution_history.status（success | error | stopped） */
export function formatFormalHistoryStatusForUi(u: UiCatalog, status: string | undefined): string {
  switch (status) {
    case "success":
      return u.history.formalStatusSuccess;
    case "error":
      return u.history.formalStatusError;
    case "stopped":
      return u.history.formalStatusStopped;
    default:
      return status?.trim() || u.common.dash;
  }
}

export function formatHistoryResultSourceForUi(u: UiCatalog, source: ResultSource): string {
  switch (source) {
    case "ai_result":
      return u.history.badgeSourceAi;
    case "fallback":
      return u.history.badgeSourceFallback;
    case "mock":
      return u.history.badgeSourceMock;
    case "error":
      return u.history.badgeSourceError;
    case "capability_result":
      return u.history.badgeSourceCapability;
    case "local_runtime":
      return u.history.badgeSourceLocal;
    default:
      return source;
  }
}

export function formatHistoryOutputTrustForUi(u: UiCatalog, trust: OutputTrust): string {
  switch (trust) {
    case "authentic":
      return u.history.badgeTrustAuthentic;
    case "non_authentic":
      return u.history.badgeTrustNonAuthentic;
    case "mixed":
      return u.history.badgeTrustMixed;
    case "error":
      return u.history.badgeTrustError;
    default:
      return trust;
  }
}

export function formatTaskStatusForUi(u: UiCatalog, status: string | undefined): string {
  switch (status) {
    case "pending":
      return u.common.taskStatusPending;
    case "planning":
      return u.common.taskStatusPlanning;
    case "ready":
      return u.common.taskStatusReady;
    case "running":
      return u.common.taskStatusRunning;
    case "success":
      return u.common.taskStatusSuccess;
    case "failed":
      return u.common.taskStatusFailed;
    case "partial_success":
      return u.common.taskStatusPartial;
    case "cancelled":
      return u.common.taskStatusCancelled;
    default:
      return status ?? u.common.taskStatusPending;
  }
}

export function formatStepStatusForUi(u: UiCatalog, status: string): string {
  switch (status) {
    case "pending":
      return u.common.taskStatusPending;
    case "running":
      return u.common.taskStatusRunning;
    case "success":
      return u.common.taskStatusSuccess;
    case "failed":
      return u.common.taskStatusFailed;
    case "skipped":
      return u.common.taskStatusSkipped;
    default:
      return status;
  }
}

export function formatPlannerSourceForUi(u: UiCatalog, raw: string | undefined): string {
  if (!raw) return u.common.dash;
  if (raw === "remote") return u.result.plannerRemote;
  if (raw === "failed") return u.result.plannerFailed;
  return raw;
}

export function formatTaskVmSourceForUi(u: UiCatalog, source: TaskVMSource): string {
  switch (source) {
    case "execution":
      return u.replay.sourceExecution;
    case "core":
      return u.replay.sourceCore;
    case "workbench":
      return u.replay.sourceWorkbench;
    case "local":
      return u.replay.sourceLocal;
    default:
      return source;
  }
}

export function formatResultVmKindForUi(u: UiCatalog, kind: string): string {
  switch (kind) {
    case "content":
      return u.replay.resultKindContent;
    case "computer":
      return u.replay.resultKindComputer;
    case "unknown":
      return u.replay.resultKindUnknown;
    default:
      return kind;
  }
}
