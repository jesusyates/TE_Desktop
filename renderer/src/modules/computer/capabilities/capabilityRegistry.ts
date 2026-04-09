import type { ComputerCapability } from "./capabilityTypes";
import { fileOrganizerCapability } from "./fileOrganizerCapability";

/**
 * 全局能力表：新能力在此追加一行即可注册。
 * 解析顺序由 capabilityResolver 按 priority 排序后决定。
 */
export const computerCapabilityRegistry: ComputerCapability[] = [fileOrganizerCapability];
