import type { TaskMode } from "../../types/taskMode";
import type { ResolvedTaskMode } from "../../types/taskMode";

/**
 * D-7-4K：结构化记忆条目类型（ViewModel / 归一化形状）。
 * - preference：由稳定偏好（常用 resolvedMode）归纳
 * - successful_pattern：对应 taskPatterns 成功统计
 * - recent_context：行为日志行
 * - capability_signal：能力使用统计归一（本轮主要存在于类型定义；聚合入 successfulCapabilities）
 */
export type MemoryItemType =
  | "preference"
  | "successful_pattern"
  | "recent_context"
  | "capability_signal";

/** D-7-4K：单条记忆 VM（hint / 未来 UI 共用） */
export type MemoryItemVM = {
  id: string;
  type: MemoryItemType;
  prompt: string;
  resolvedMode: ResolvedTaskMode;
  intent: string;
  capabilityIds: string[];
  success: boolean;
  createdAt: string;
  /** successful_pattern：与 patternKeyFromAnalysis 对齐 */
  patternKey?: string;
  successCount?: number;
  promptExamples?: string[];
};

/** D-7-4Q：失败执行结构化信号（不替代 success 布尔） */
export type MemoryFailureType =
  | "safety"
  | "permission"
  | "budget"
  | "runtime"
  | "empty_result"
  | "unknown";

export type MemoryFailureSignal = {
  source: "execution_failure";
  createdAt: string;
  patternKey?: string;
  failureType: MemoryFailureType;
  failureReason?: string;
};

/** D-7-4R：窗口内某 pattern 失败聚合（仅含出现过 failureSignal 的条目） */
export type RecentFailurePatternBrief = {
  patternKey: string;
  failureCount: number;
  lastFailureAt: string;
};

/** D-7-4R：窗口内某能力失败/成功并列（用于轻量避坑，非全局统计） */
export type RecentFailureCapabilityBrief = {
  capabilityId: string;
  failureCount: number;
  successCount: number;
  lastFailureAt: string;
};

/** D-7-4R：窗口内失败类型计数 */
export type RecentFailureTypeBrief = {
  failureType: MemoryFailureType;
  count: number;
};

/**
 * D-7-4K：供 getMemoryHintsForTask 消费的统一快照（由本地 MemorySnapshot 构建，无网络）。
 */
export type MemoryHintsSnapshot = {
  recentContext: MemoryItemVM[];
  preferredModes: ResolvedTaskMode[];
  successfulCapabilities: string[];
  recentSuccessfulPatterns: MemoryItemVM[];
  /** D-7-4R：最近行为窗口内带 failureSignal 的 pattern 聚合 */
  recentFailurePatterns: RecentFailurePatternBrief[];
  /** D-7-4R：最近窗口内能力与失败/成功次数（仅包含有失败的 cap） */
  recentFailureCapabilities: RecentFailureCapabilityBrief[];
  /** D-7-4R：最近窗口内 failureType 分布 */
  recentFailureTypes: RecentFailureTypeBrief[];
};

/** D-7-4M：模板保存/启动时传入 getMemoryHintsForTask 的轻量上下文 */
export type MemoryHintsTemplateContext = {
  templateId: string;
  workflowType?: string;
};

/** D-7-4M：嵌在行为日志中的模板记忆信号（不重开 store） */
export type MemoryTemplateSignal = {
  source: "template_saved" | "template_run";
  templateId: string;
  workflowType: string;
  platform: string;
  createdAt: string;
  /** D-7-4N：与模板持久化对齐的来源关系 */
  sourceTaskId?: string;
  sourceRunId?: string;
  sourceResultKind?: "content" | "computer" | "none";
};

/** D-7-4P：成功执行质量分级（不修改 success 布尔语义） */
export type MemorySuccessQuality = "high" | "medium" | "low";

/** D-7-4O / D-7-4P：成功经验自动沉淀元数据 */
export type MemoryExecutionSuccessSignal = {
  source: "execution_success";
  createdAt: string;
  patternKey?: string;
  successQuality: MemorySuccessQuality;
};

export type UserBehaviorMemory = {
  id: string;
  timestamp: string;
  prompt: string;
  requestedMode: TaskMode;
  resolvedMode: ResolvedTaskMode;
  intent: string;
  planId: string | null;
  stepIds: string[];
  capabilityIds: string[];
  resultKind: "content" | "computer" | "none";
  success: boolean;
  /** D-7-3Q：与 Core memory hash 对齐，供一致性探测 */
  contentHash?: string;
  /** D-7-4M：模板相关信号（与 capabilityIds 并存，供 hints 快速匹配） */
  templateSignal?: MemoryTemplateSignal;
  /** D-7-4O：成功执行沉淀标记（与 TaskPatternMemory 并存，不重写模板信号） */
  executionSuccessSignal?: MemoryExecutionSuccessSignal;
  /** D-7-4Q：失败/中断执行沉淀标记 */
  failureSignal?: MemoryFailureSignal;
};

export type CapabilityUsageMemory = {
  capabilityId: string;
  usedCount: number;
  successCount: number;
  lastUsedAt: string;
};

export type TaskPatternMemory = {
  patternKey: string;
  promptExamples: string[];
  preferredMode: ResolvedTaskMode;
  preferredCapabilityIds: string[];
  successCount: number;
  lastUsedAt: string;
};

export type MemorySnapshot = {
  behaviorLog: UserBehaviorMemory[];
  capabilityStats: CapabilityUsageMemory[];
  taskPatterns: TaskPatternMemory[];
};
