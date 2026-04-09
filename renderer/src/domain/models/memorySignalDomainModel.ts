/**
 * D-7-4T：AICS Domain — 行为 / 执行 / 模板相关记忆信号（对应 UserBehaviorMemory 上的signals）。
 */

import type { MemoryFailureType, MemorySuccessQuality } from "../../modules/memory/memoryTypes";

export type MemorySignalDomainType =
  | "behavior"
  | "execution_success"
  | "execution_failure"
  | "template_signal";

export type MemorySignalDomainModel = {
  type: MemorySignalDomainType;
  /** 与 MemoryFailureSignal / MemoryExecutionSuccessSignal / MemoryTemplateSignal 的 source 对齐 */
  source: string;
  patternKey?: string;
  capabilityIds: string[];
  success?: boolean;
  successQuality?: MemorySuccessQuality;
  failureType?: MemoryFailureType;
  createdAt: string;
};
