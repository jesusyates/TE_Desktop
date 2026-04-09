import type { CapabilityResolution } from "../../types/desktopRuntime";

export type HubCardStatus = "installed" | "alternative" | "not_installed";

/**
 * 结合 resolver 结果与是否「可能匹配本机程序」导出三种用户向状态。
 */
export function deriveHubStatus(res: CapabilityResolution | undefined, expectLocalApp: boolean): HubCardStatus {
  if (!res) return expectLocalApp ? "not_installed" : "alternative";
  if (res.satisfied) return "installed";
  if (!expectLocalApp) return "alternative";
  return "not_installed";
}
