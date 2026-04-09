import type { TaskAttachmentMeta } from "../../../types/task";
import type { ComputerExecutionEvent } from "../../../types/computerExecution";

/** capability.match / capability.run 共用入参 */
export type ComputerCapabilityContext = {
  prompt: string;
  attachments: TaskAttachmentMeta[];
};

export type ComputerCapabilityEmit = (event: ComputerExecutionEvent) => void;

/**
 * D-5-4：单条 Computer 能力定义。执行器统一签名 (input, emitEvent) => Promise<void>。
 * 已用：priority（越大越优先）。
 * 预留：multi-step 编排、fallback 链路等可在本类型与 resolver 上扩展，无需改 session。
 */
export type ComputerCapability = {
  id: string;
  name: string;
  description: string;
  /** 越大越优先；未设置视为 0 */
  priority?: number;
  match: (input: ComputerCapabilityContext) => boolean;
  run: (input: ComputerCapabilityContext, emitEvent: ComputerCapabilityEmit) => Promise<void>;
};
