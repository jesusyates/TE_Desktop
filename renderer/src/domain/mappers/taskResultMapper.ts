/**
 * D-7-4T：TaskResult → ResultDomainModel
 */

import type { TaskResult } from "../../modules/result/resultTypes";
import type { ResultDomainModel } from "../models/resultDomainModel";

export function taskResultToDomainModel(
  taskId: string | undefined,
  result: TaskResult,
  meta?: { hash?: string; hasCoreSync?: boolean }
): ResultDomainModel {
  const bodyRaw = result.body ?? result.summary ?? "";
  const body = typeof bodyRaw === "string" ? bodyRaw : "";
  const tid = taskId?.trim();
  return {
    ...(tid ? { taskId: tid } : {}),
    kind: result.kind,
    title: (result.title ?? "").trim(),
    body,
    summary: result.summary?.trim() || undefined,
    hash: meta?.hash,
    hasCoreSync: meta?.hasCoreSync
  };
}
