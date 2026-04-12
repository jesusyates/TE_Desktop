/**
 * H-1：统一应用偏好模型（本地持久化）；禁止各页面长期散落同名开关。
 */
import type { TaskMode } from "../../types/taskMode";

export const APP_PREFERENCES_STORAGE_KEY = "aics.appPreferences.v1";
export const APP_PREFERENCES_UPDATED_EVENT = "aics:app-preferences-updated";

const LEGACY_USER_PREFS_KEY = "aics.userPreferences.v1";

export type TemplatesTabPreference = "library" | "mine" | "favorites" | "recent";

export type AppPreferencesV1 = {
  version: 1;
  execution: {
    defaultTaskMode: TaskMode;
    /** 仅偏好展示；不改变服务端安全、路由与强制降级规则 */
    preferAiCapabilities: boolean;
    /** 工作台：执行步骤面板 + 结果区来源说明等 */
    showExecutionSourceAndSteps: boolean;
  };
  memoryTemplate: {
    applyMemoryHintsInTasks: boolean;
    showRoundMemoryHintsBar: boolean;
    defaultTemplatesTab: TemplatesTabPreference;
    /** H-3：工作台模板芯片是否显示「查看详情」链接 */
    showTemplateHintInWorkbench: boolean;
  };
  /** Trust & Data Safety v1：关闭时 L2+ 云端任务每次须确认 */
  trust: {
    allowAutoCloudAi: boolean;
  };
  /**
   * Data Safety v1：与 trust/Memory/History 同一偏好树；门控客户端写入与请求载荷形态。
   * 不替代服务端强制安全策略。
   */
  dataSafety: {
    /** 终态是否调用 `appendExecutionHistory` 写入服务端任务历史摘要（须登录） */
    allowServerHistoryWrite: boolean;
    /** 是否允许任务结束后写入记忆回放与 Shared Core 同步（recordTaskExecution、canonical flush、`POST /v1/memory/entries`） */
    allowTaskMemoryWrite: boolean;
    /** 是否随发往 Shared Core（会话相关请求等）附带附件元数据；关闭则工作台提交前剥离；**不影响**本地分析链 */
    sendAttachmentMetadataToCore: boolean;
  };
  /** Content Intelligence Phase 1：工作台归因面板（伪多智能体预检，无直连模型） */
  contentIntelligence: {
    phase1WorkbenchPanel: boolean;
  };
};

export const DEFAULT_APP_PREFERENCES: AppPreferencesV1 = {
  version: 1,
  execution: {
    defaultTaskMode: "auto",
    preferAiCapabilities: true,
    showExecutionSourceAndSteps: true
  },
  memoryTemplate: {
    applyMemoryHintsInTasks: true,
    showRoundMemoryHintsBar: true,
    defaultTemplatesTab: "library",
    showTemplateHintInWorkbench: true
  },
  trust: {
    allowAutoCloudAi: true
  },
  dataSafety: {
    allowServerHistoryWrite: true,
    allowTaskMemoryWrite: true,
    sendAttachmentMetadataToCore: true
  },
  contentIntelligence: {
    phase1WorkbenchPanel: false
  }
};

function normalizeTaskMode(v: unknown): TaskMode {
  return v === "auto" || v === "content" || v === "computer" ? v : "auto";
}

function normalizeTemplatesTab(v: unknown): TemplatesTabPreference {
  return v === "library" || v === "mine" || v === "favorites" || v === "recent" ? v : "library";
}

function coerceStored(raw: unknown): AppPreferencesV1 {
  const base = DEFAULT_APP_PREFERENCES;
  if (!raw || typeof raw !== "object")
    return {
      ...base,
      execution: { ...base.execution },
      memoryTemplate: { ...base.memoryTemplate },
      trust: { ...base.trust },
      dataSafety: { ...base.dataSafety },
      contentIntelligence: { ...base.contentIntelligence }
    };
  const o = raw as Record<string, unknown>;
  const ex = o.execution && typeof o.execution === "object" ? (o.execution as Record<string, unknown>) : {};
  const mt = o.memoryTemplate && typeof o.memoryTemplate === "object" ? (o.memoryTemplate as Record<string, unknown>) : {};
  const tr = o.trust && typeof o.trust === "object" ? (o.trust as Record<string, unknown>) : {};
  const ds = o.dataSafety && typeof o.dataSafety === "object" ? (o.dataSafety as Record<string, unknown>) : {};
  const ci = o.contentIntelligence && typeof o.contentIntelligence === "object" ? (o.contentIntelligence as Record<string, unknown>) : {};
  return {
    version: 1,
    execution: {
      defaultTaskMode: normalizeTaskMode(ex.defaultTaskMode ?? base.execution.defaultTaskMode),
      preferAiCapabilities:
        typeof ex.preferAiCapabilities === "boolean" ? ex.preferAiCapabilities : base.execution.preferAiCapabilities,
      showExecutionSourceAndSteps:
        typeof ex.showExecutionSourceAndSteps === "boolean"
          ? ex.showExecutionSourceAndSteps
          : base.execution.showExecutionSourceAndSteps
    },
    memoryTemplate: {
      applyMemoryHintsInTasks:
        typeof mt.applyMemoryHintsInTasks === "boolean"
          ? mt.applyMemoryHintsInTasks
          : base.memoryTemplate.applyMemoryHintsInTasks,
      showRoundMemoryHintsBar:
        typeof mt.showRoundMemoryHintsBar === "boolean"
          ? mt.showRoundMemoryHintsBar
          : base.memoryTemplate.showRoundMemoryHintsBar,
      defaultTemplatesTab: normalizeTemplatesTab(mt.defaultTemplatesTab ?? base.memoryTemplate.defaultTemplatesTab),
      showTemplateHintInWorkbench:
        typeof mt.showTemplateHintInWorkbench === "boolean"
          ? mt.showTemplateHintInWorkbench
          : base.memoryTemplate.showTemplateHintInWorkbench
    },
    trust: {
      allowAutoCloudAi:
        typeof tr.allowAutoCloudAi === "boolean" ? tr.allowAutoCloudAi : base.trust.allowAutoCloudAi
    },
    dataSafety: {
      allowServerHistoryWrite:
        typeof ds.allowServerHistoryWrite === "boolean"
          ? ds.allowServerHistoryWrite
          : base.dataSafety.allowServerHistoryWrite,
      allowTaskMemoryWrite:
        typeof ds.allowTaskMemoryWrite === "boolean"
          ? ds.allowTaskMemoryWrite
          : base.dataSafety.allowTaskMemoryWrite,
      sendAttachmentMetadataToCore:
        typeof ds.sendAttachmentMetadataToCore === "boolean"
          ? ds.sendAttachmentMetadataToCore
          : base.dataSafety.sendAttachmentMetadataToCore
    },
    contentIntelligence: {
      phase1WorkbenchPanel:
        typeof ci.phase1WorkbenchPanel === "boolean"
          ? ci.phase1WorkbenchPanel
          : base.contentIntelligence.phase1WorkbenchPanel
    }
  };
}

function readLegacyUserPrefsTaskMode(): TaskMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_USER_PREFS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { defaultTaskMode?: unknown };
    const m = o?.defaultTaskMode;
    return m === "auto" || m === "content" || m === "computer" ? m : null;
  } catch {
    return null;
  }
}

export function loadAppPreferences(): AppPreferencesV1 {
  if (typeof window === "undefined") {
    return {
      ...DEFAULT_APP_PREFERENCES,
      execution: { ...DEFAULT_APP_PREFERENCES.execution },
      memoryTemplate: { ...DEFAULT_APP_PREFERENCES.memoryTemplate },
      trust: { ...DEFAULT_APP_PREFERENCES.trust },
      dataSafety: { ...DEFAULT_APP_PREFERENCES.dataSafety },
      contentIntelligence: { ...DEFAULT_APP_PREFERENCES.contentIntelligence }
    };
  }
  try {
    const raw = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      const legacyMode = readLegacyUserPrefsTaskMode();
      const merged: AppPreferencesV1 = {
        ...DEFAULT_APP_PREFERENCES,
        execution: {
          ...DEFAULT_APP_PREFERENCES.execution,
          ...(legacyMode ? { defaultTaskMode: legacyMode } : {})
        },
        memoryTemplate: { ...DEFAULT_APP_PREFERENCES.memoryTemplate },
        trust: { ...DEFAULT_APP_PREFERENCES.trust },
        dataSafety: { ...DEFAULT_APP_PREFERENCES.dataSafety },
        contentIntelligence: { ...DEFAULT_APP_PREFERENCES.contentIntelligence }
      };
      saveAppPreferences(merged);
      return merged;
    }
    return coerceStored(JSON.parse(raw) as unknown);
  } catch {
    return {
      ...DEFAULT_APP_PREFERENCES,
      execution: { ...DEFAULT_APP_PREFERENCES.execution },
      memoryTemplate: { ...DEFAULT_APP_PREFERENCES.memoryTemplate },
      trust: { ...DEFAULT_APP_PREFERENCES.trust },
      dataSafety: { ...DEFAULT_APP_PREFERENCES.dataSafety },
      contentIntelligence: { ...DEFAULT_APP_PREFERENCES.contentIntelligence }
    };
  }
}

export function saveAppPreferences(next: AppPreferencesV1): void {
  if (typeof window === "undefined") return;
  try {
    const payload: AppPreferencesV1 = {
      version: 1,
      execution: { ...next.execution },
      memoryTemplate: { ...next.memoryTemplate },
      trust: { ...next.trust },
      dataSafety: { ...next.dataSafety },
      contentIntelligence: { ...next.contentIntelligence }
    };
    window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(APP_PREFERENCES_UPDATED_EVENT, { detail: payload }));
  } catch {
    /* quota */
  }
}

export function patchAppPreferences(partial: Partial<{
  execution: Partial<AppPreferencesV1["execution"]>;
  memoryTemplate: Partial<AppPreferencesV1["memoryTemplate"]>;
  trust: Partial<AppPreferencesV1["trust"]>;
  dataSafety: Partial<AppPreferencesV1["dataSafety"]>;
  contentIntelligence: Partial<AppPreferencesV1["contentIntelligence"]>;
}>): AppPreferencesV1 {
  const cur = loadAppPreferences();
  const next: AppPreferencesV1 = {
    version: 1,
    execution: { ...cur.execution, ...(partial.execution ?? {}) },
    memoryTemplate: { ...cur.memoryTemplate, ...(partial.memoryTemplate ?? {}) },
    trust: { ...cur.trust, ...(partial.trust ?? {}) },
    dataSafety: { ...cur.dataSafety, ...(partial.dataSafety ?? {}) },
    contentIntelligence: {
      ...cur.contentIntelligence,
      ...(partial.contentIntelligence ?? {})
    }
  };
  saveAppPreferences(next);
  return next;
}

export function subscribeAppPreferences(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = () => handler();
  window.addEventListener(APP_PREFERENCES_UPDATED_EVENT, fn);
  return () => window.removeEventListener(APP_PREFERENCES_UPDATED_EVENT, fn);
}
