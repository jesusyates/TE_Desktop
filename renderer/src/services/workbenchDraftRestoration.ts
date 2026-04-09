/**
 * D-7-4X：工作台输入草稿 — 恢复与持久化规则收口（热状态 draftInput）。
 * - 启动时优先从未提交草稿恢复（见 getInitialWorkbenchDraftInput + Workbench 初始 state）。
 * - 防抖持久化仅在用户编辑时由页面 effect 调用 scheduleWorkbenchDraftPersist。
 * - 任务提交成功后立刻清空持久化草稿并配合 UI 清空输入栏，避免下一轮误恢复。
 */

import { flushPersistHotStateNow, loadHotSnapshot, schedulePersistHotState } from "./stateRestoration";

export function getInitialWorkbenchDraftInput(): string {
  return loadHotSnapshot()?.draftInput ?? "";
}

export function scheduleWorkbenchDraftPersist(text: string): void {
  schedulePersistHotState({ draftInput: text });
}

export function clearWorkbenchDraftAfterSuccessfulSubmit(): void {
  flushPersistHotStateNow({ draftInput: "" });
}
