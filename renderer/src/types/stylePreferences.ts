/**
 * D-7-5B：用户风格偏好（v1 本地域模型；无云同步）。
 */

export type StyleOutputLength = "short" | "medium" | "long";

/** 随任务进入分析/会话上下文的快照（空字段省略） */
export type StylePreferencesSnapshot = {
  tone?: string;
  audience?: string;
  outputLength?: StyleOutputLength;
  languagePreference?: string;
  notes?: string;
};
