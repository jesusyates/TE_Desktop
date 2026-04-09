import type { TaskAnalysisResult } from "../modules/workbench/analyzer/taskAnalyzerTypes";
import type { TaskPlan } from "../modules/workbench/planner/taskPlanTypes";
import type { SafetyCheckResult } from "../modules/safety/safetyTypes";
import type { PermissionCheckResult } from "../modules/permissions/permissionTypes";
import type { ResolvedTaskMode, TaskMode } from "./taskMode";
import type { StylePreferencesSnapshot } from "./stylePreferences";
import type { TemplateCoreContentNormalized } from "../services/coreTemplateService";
import type { RouterDecision } from "../modules/router/routerTypes";

/** 本地附件元数据（D-3-1：无上传，仅随 createTask 预留 importedMaterials） */
export type TaskAttachmentMeta = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

/** 启动任务载荷（prompt + 可选附件 + 可选模板来源） */
export type StartTaskPayload = {
  prompt: string;
  attachments?: TaskAttachmentMeta[];
  /** D-4-2：由模板注入发起时透传，后端可忽略 */
  templateId?: string;
  /** E-3：自 GET /templates/:id 的 content 规范化快照；执行上下文唯一主源（须与 templateId 同轮一致） */
  templateCoreContent?: TemplateCoreContentNormalized;
  /** D-5-1：用户所选模式（auto 时在 session 内解析） */
  requestedMode?: TaskMode;
  /** D-5-1：路由结果，由 session 在 start 时写入 */
  resolvedMode?: ResolvedTaskMode;
  /** D-7-3C：Core /analyze 结果；有则 session 优先使用，不再本地 analyzeTask */
  analysisOverride?: TaskAnalysisResult;
  /** D-7-3D：Core /plan 结果；有则 armPipeline 优先使用，不再本地 planTask */
  planOverride?: TaskPlan;
  /** D-7-3E：Core /safety-check；有则 armPipeline 优先使用，不再本地主路径 runSafetyCheck */
  safetyOverride?: SafetyCheckResult;
  /** D-7-3F：Core /permission-check 按 capabilityId 汇总；有则优先于本地主路径 checkPermissions */
  permissionOverrideMap?: Record<string, PermissionCheckResult>;
  /** D-7-5B：设置页维护的风格偏好；并入 `TaskAnalysisResult.stylePreferences`，不单独增加 await */
  stylePreferences?: StylePreferencesSnapshot;
  /** AI Router v1：由 Core /analyze·/plan 注入，随会话与 createTask 占位透传 */
  routerDecision?: RouterDecision;
  /** Memory Evolution v1：本轮 prompt 是否因轻记忆命中而加前缀（写入 TaskResult.metadata） */
  lightMemoryHits?: string[];
  /** Next Task Suggestion v1：用户原始输入行（与 execution prompt 区分，用于建议去重与主题抽取） */
  submitUserLine?: string;
  /** Intent Enrichment v1：为 true 时跳过执行前预览（确认执行 / 建议链 / 澄清后续） */
  skipIntentPreview?: boolean;
  /** Workflow / Task Chain v1：链式自动发起的提交；为 true 时不因「新提交」而中止链 */
  workflowChainAuto?: boolean;
};

export type TaskInput = {
  oneLinePrompt: string;
  importedMaterials: string[];
  /** D-4-2：预留，与 StartTaskPayload.templateId 对齐 */
  templateId?: string;
  /** D-5-1：预留，后端可忽略 */
  requestedMode?: TaskMode;
  resolvedMode?: ResolvedTaskMode;
  /** AI Router v1：占位，后端可忽略 */
  routerDecision?: RouterDecision;
};

export type ResultPackage = {
  title: string;
  hook: string;
  contentStructure: string;
  body: string;
  copywriting: string;
  tags: string[];
  publishSuggestion: string;
};

export type TaskRecord = {
  id: string;
  input: TaskInput;
  output: ResultPackage;
  createdAt: string;
};
