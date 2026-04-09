import { apiClient } from "./apiClient";
import { getAicsDesktop } from "./desktopBridge";
import type { CapabilityResolution } from "../types/desktopRuntime";
import type { ScannedTool } from "../types/desktopRuntime";

export async function inferRequiredCapabilitiesApi(oneLine: string, stepTitles: string[]): Promise<string[]> {
  const b = getAicsDesktop();
  if (b) {
    return b.inferCapabilities(oneLine, stepTitles);
  }
  const { data } = await apiClient.post<{ required: string[] }>("/aics/capabilities:infer", {
    oneLine,
    stepTitles
  });
  return data.required ?? [];
}

export async function resolveCapabilitiesApi(
  tools: ScannedTool[],
  required: string[]
): Promise<CapabilityResolution[]> {
  const b = getAicsDesktop();
  if (b) {
    return b.resolveCapabilities(tools, required);
  }
  const { data } = await apiClient.post<{ resolutions: CapabilityResolution[] }>("/aics/capabilities:resolve", {
    tools,
    required
  });
  return data.resolutions ?? [];
}
