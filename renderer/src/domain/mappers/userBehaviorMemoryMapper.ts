/**
 * D-7-4T：UserBehaviorMemory → MemorySignalDomainModel
 */

import type { UserBehaviorMemory } from "../../modules/memory/memoryTypes";
import type { MemorySignalDomainModel, MemorySignalDomainType } from "../models/memorySignalDomainModel";

export function userBehaviorMemoryToSignalDomain(b: UserBehaviorMemory): MemorySignalDomainModel {
  const capabilityIds = [...b.capabilityIds];
  const createdAt = b.timestamp;

  if (b.executionSuccessSignal) {
    const type: MemorySignalDomainType = "execution_success";
    return {
      type,
      source: b.executionSuccessSignal.source,
      patternKey: b.executionSuccessSignal.patternKey ?? `${b.resolvedMode}:${b.intent}`,
      capabilityIds,
      success: true,
      successQuality: b.executionSuccessSignal.successQuality,
      createdAt
    };
  }

  if (b.failureSignal) {
    const type: MemorySignalDomainType = "execution_failure";
    return {
      type,
      source: b.failureSignal.source,
      patternKey: b.failureSignal.patternKey ?? `${b.resolvedMode}:${b.intent}`,
      capabilityIds,
      success: false,
      failureType: b.failureSignal.failureType,
      createdAt
    };
  }

  if (b.templateSignal) {
    const type: MemorySignalDomainType = "template_signal";
    return {
      type,
      source: b.templateSignal.source,
      capabilityIds,
      success: b.success,
      createdAt
    };
  }

  return {
    type: "behavior",
    source: "behavior_log",
    patternKey: `${b.resolvedMode}:${b.intent}`,
    capabilityIds,
    success: b.success,
    createdAt
  };
}
