/**
 * D-7-3S：热状态快照 — 单独 key、极小体积、启动优先读取；不含列表/日志/全文结果。
 */

export const HOT_STATE_STORAGE_KEY = "aics.hotState.v1";
export const RESTORE_VERSION = 1;

/** 与 TaskMode 对齐的字符串，避免循环依赖 */
export type HotActiveMode = "auto" | "content" | "computer";

export type HotPanelState = {
  templatePanelOpen?: boolean;
};

export type HotStateSnapshot = {
  lastRoute: string;
  selectedTaskId: string;
  selectedHistorySource: "core" | "local" | null;
  draftInput: string;
  activeMode: HotActiveMode;
  panelState: HotPanelState;
  /** 预留 workspace；当前无多 workspace 时用 userId 或空串 */
  lastOpenedWorkspace: string;
  restoreVersion: number;
  savedAt: string;
};

const VALID_ROUTE_PREFIXES = [
  "/workbench",
  "/tool-hub",
  "/tools",
  "/history",
  "/saved-results",
  "/memory",
  "/templates",
  "/account",
  "/usage",
  "/settings",
  "/automation"
] as const;

export function isValidRestoreRoute(pathname: string): boolean {
  const p = pathname.trim();
  if (!p.startsWith("/") || p.includes("..")) return false;
  return VALID_ROUTE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function defaultHotState(): HotStateSnapshot {
  const now = new Date().toISOString();
  return {
    lastRoute: "/workbench",
    selectedTaskId: "",
    selectedHistorySource: null,
    draftInput: "",
    activeMode: "auto",
    panelState: {},
    lastOpenedWorkspace: "",
    restoreVersion: RESTORE_VERSION,
    savedAt: now
  };
}

function normalizeHotMode(v: unknown): HotActiveMode {
  if (v === "auto" || v === "content" || v === "computer") return v;
  return "auto";
}

export function loadHotSnapshot(): HotStateSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HOT_STATE_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<HotStateSnapshot>;
    if (!o || typeof o !== "object") return null;
    const base = defaultHotState();
    const src = o.selectedHistorySource;
    return {
      ...base,
      lastRoute: typeof o.lastRoute === "string" && o.lastRoute ? o.lastRoute : base.lastRoute,
      selectedTaskId: typeof o.selectedTaskId === "string" ? o.selectedTaskId : "",
      selectedHistorySource: src === "core" || src === "local" ? src : null,
      draftInput: typeof o.draftInput === "string" ? o.draftInput : "",
      activeMode: normalizeHotMode(o.activeMode),
      panelState:
        o.panelState && typeof o.panelState === "object"
          ? { ...(o.panelState as HotPanelState) }
          : {},
      lastOpenedWorkspace:
        typeof o.lastOpenedWorkspace === "string" ? o.lastOpenedWorkspace : "",
      restoreVersion:
        typeof o.restoreVersion === "number" && Number.isFinite(o.restoreVersion)
          ? o.restoreVersion
          : RESTORE_VERSION,
      savedAt: typeof o.savedAt === "string" ? o.savedAt : base.savedAt
    };
  } catch {
    return null;
  }
}

export function persistHotSnapshot(next: HotStateSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const payload: HotStateSnapshot = {
      ...next,
      restoreVersion: RESTORE_VERSION,
      savedAt: new Date().toISOString()
    };
    window.localStorage.setItem(HOT_STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function mergePersist(patch: Partial<HotStateSnapshot>): void {
  const cur = loadHotSnapshot() ?? defaultHotState();
  persistHotSnapshot({
    ...cur,
    ...patch,
    panelState: { ...cur.panelState, ...(patch.panelState ?? {}) }
  });
}

let persistTimer: number | null = null;

/** 合并写入热状态；防抖避免卡顿 */
export function schedulePersistHotState(patch: Partial<HotStateSnapshot>, debounceMs = 400): void {
  if (typeof window === "undefined") return;
  if (persistTimer != null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    mergePersist(patch);
  }, debounceMs);
}

/**
 * 立即合并写入热状态（取消待执行的防抖写入），供草稿在任务提交成功后立刻清空等场景。
 */
export function flushPersistHotStateNow(patch: Partial<HotStateSnapshot>): void {
  if (typeof window === "undefined") return;
  if (persistTimer != null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  mergePersist(patch);
}
