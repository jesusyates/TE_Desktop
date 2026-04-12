/**
 * D-7-4E：设置 / 偏好收口（禁止在页面散写 market、locale、默认模式逻辑）。
 */

import type { TaskMode } from "../types/taskMode";
import { useAuthStore } from "../store/authStore";
import { getAuthSessionSnapshot } from "./authSession";
import { getCoreRequestHeaders } from "./coreRequestContext";
import { getMyPreferences, updateMyPreferences, type UserPreference } from "./preferencesApi";
import { SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { getLastExportPathForDisplay } from "./localRuntimeService";
import { HOT_STATE_STORAGE_KEY, loadHotSnapshot } from "./stateRestoration";
import { loadAppPreferences, patchAppPreferences } from "../modules/preferences/appPreferences";

/** 用户设置的默认任务模式（本机）；无记录时为 auto */
export function getUserDefaultTaskMode(): TaskMode {
  return loadAppPreferences().execution.defaultTaskMode;
}

export function setUserDefaultTaskMode(mode: TaskMode): void {
  patchAppPreferences({ execution: { defaultTaskMode: mode } });
}

/**
 * 工作台初始任务模式：存在热状态快照时用其 activeMode；否则用用户默认；最后为 auto。
 * （热状态由上次在工作台切模式时 schedulePersistHotState 写入。）
 */
export function resolveWorkbenchInitialTaskMode(): TaskMode {
  const hot = loadHotSnapshot();
  if (hot != null) {
    return hot.activeMode;
  }
  return getUserDefaultTaskMode();
}

export async function loadRemotePreferencesForSettings(): Promise<UserPreference | null> {
  try {
    return await getMyPreferences();
  } catch {
    return null;
  }
}

export function getSessionMarketLocale(): { market: string; locale: string } {
  const s = useAuthStore.getState();
  return { market: s.market, locale: s.locale };
}

export function persistMarketLocale(market: string, locale: string): Promise<UserPreference> {
  return updateMyPreferences(market, locale);
}

export type SettingsLocalDiagnostics = {
  clientId: string;
  authMode: "session" | "guest";
  hotStatePersisted: boolean;
  /** D-7-4X：最近一次成功导出路径（只读展示；无则为 null） */
  lastExportPath: string | null;
  /** D-7-5A：当前生效的 Shared Core HTTP 基址（只读） */
  sharedCoreBaseUrl: string;
};

export function getSettingsLocalDiagnostics(): SettingsLocalDiagnostics {
  const headers = getCoreRequestHeaders();
  const clientId = String(headers["x-aics-client-id"] ?? "").trim() || "—";
  const snap = getAuthSessionSnapshot();
  const hotStatePersisted =
    typeof window !== "undefined" && window.localStorage.getItem(HOT_STATE_STORAGE_KEY) != null;
  return {
    clientId,
    authMode: snap.isGuest ? "guest" : "session",
    hotStatePersisted,
    lastExportPath: getLastExportPathForDisplay(),
    sharedCoreBaseUrl: SHARED_CORE_BASE_URL
  };
}
