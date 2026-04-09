import { computerCapabilityRegistry } from "./capabilityRegistry";
import type { ComputerCapability } from "./capabilityTypes";

function sortedCapabilities(): ComputerCapability[] {
  return [...computerCapabilityRegistry].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );
}

/**
 * 按 Task Analyzer 给出的 id 列表在注册表中解析能力（priority 高者优先，同优先级保持注册表序）。
 * 禁止在此处根据 prompt 关键词选能力。
 */
export function resolveCapabilityFromCandidates(ids: string[]): ComputerCapability | null {
  if (!ids.length) return null;
  const idSet = new Set(ids);
  const matches = sortedCapabilities().filter((c) => idSet.has(c.id));
  return matches[0] ?? null;
}
