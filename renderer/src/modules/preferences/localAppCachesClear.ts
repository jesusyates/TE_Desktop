/**
 * H-1：信任与数据 — 清除本地草稿 / 工作台 UI 快照 / 执行详情缓存（不涉及账户令牌）。
 */
import { HOT_STATE_STORAGE_KEY } from "../../services/stateRestoration";
import { WORKBENCH_UI_STORAGE_KEY } from "../../services/workbenchUiPersistence";
import { clearExecutionDetailLocalCaches } from "../../services/executionDetailLocalCache";

export function clearLocalWorkbenchDraftsAndExecutionCaches(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HOT_STATE_STORAGE_KEY);
    window.localStorage.removeItem(WORKBENCH_UI_STORAGE_KEY);
  } catch {
    /* quota */
  }
  clearExecutionDetailLocalCaches();
}
