import { isAxiosError } from "axios";
import type { TaskAnalysisResult } from "../modules/workbench/analyzer/taskAnalyzerTypes";
import type { TaskPlan } from "../modules/workbench/planner/taskPlanTypes";
import type { SafetyCheckResult } from "../modules/safety/safetyTypes";
import type {
  PermissionCheckResult,
  PermissionKey
} from "../modules/permissions/permissionTypes";
import type { ParsedAiContentSuccess } from "../modules/ai/aiContentWireTypes";
import {
  formatAiContentTransportMessage,
  parsedFailureToInvokeError
} from "../modules/ai/parseAiContentWire";
import {
  mapAiContentActionToExecutePrompt,
  parseSharedCoreAiExecuteResponse
} from "../modules/ai/parseSharedCoreAiExecute";
import type { TaskMode } from "../types/taskMode";
import type { TaskAttachmentMeta } from "../types/task";
import type { CoreMemoryHintsWire } from "../modules/memory/workbenchCoreMemoryHints";
import { apiClient } from "./apiClient";
import { normalizeV1ResponseBody } from "./v1Envelope";
import { analyzeTask } from "../modules/workbench/analyzer/taskAnalyzer";
import { planTask } from "../modules/workbench/planner/taskPlanner";
import { executionPlanToTaskPlanMirror } from "../modules/workbench/execution/executionPlanAdapters";
import { runSafetyCheck } from "../modules/safety/safetyChecker";
import { checkPermissions } from "../modules/permissions/permissionChecker";
import { getCapabilityPermissions } from "../modules/permissions/permissionRegistry";
import type { ExecutionTrustAssessment } from "../modules/trust/trustTypes";
import type {
  ControllerAlignmentBundle,
  ControllerPlanV1
} from "../modules/controller";
import type { IntelOrchestrationTrace } from "../modules/contentIntelligence/types";
import { runIntelPreFlight } from "../modules/contentIntelligence";
import type { HistoryListItemDto } from "./history.api";
import type { RouterDecision } from "../modules/router/routerTypes";

/**
 * P1 / P2 / P3：Memory、模板、Content Intelligence 预检、系统策略、审计旁路已收口或本地化；业务 API 走 Shared Core `apiClient`。P0 已迁 `/result`、`/task`、`/memory-record` 写入。
 * **G-1 内容生成**（`invokeAiContentOnCore`）走 **`apiClient` → `POST /v1/ai/execute`**（Shared Core）。
 * **Workbench Analyze / Plan / Safety / Permission** 为 renderer 本地规则。
 * D-7-4Z：**权威执行真相源**仍为 `useExecutionSession`。
 * D-7-5A：`API_BASE_URL` 与 `SHARED_CORE_BASE_URL` 同源，见 `config/runtimeEndpoints`。
 */
export { API_BASE_URL } from "../config/runtimeEndpoints";

/** G-1：`POST /v1/ai/execute`（Shared Core）；调用方仍传 `action`+`prompt`，由 `mapAiContentActionToExecutePrompt` 映射。 */
export type InvokeAiContentOnCoreInput = {
  action: "generate" | "summarize";
  prompt: string;
};

export type InvokeAiContentOnCoreResult = ParsedAiContentSuccess;

/**
 * G-1A：Shared Core `POST /v1/ai/execute`；响应经 `parseSharedCoreAiExecuteResponse` 归一为 `ParsedAiContentSuccess`。
 * 业务失败与非法成功响应均抛错 → 执行步 error，无假完成。
 */
export async function invokeAiContentOnCore(
  input: InvokeAiContentOnCoreInput
): Promise<InvokeAiContentOnCoreResult> {
  const payload = { prompt: mapAiContentActionToExecutePrompt(input.action, input.prompt) };
  let data: unknown;
  try {
    const { data: d } = await apiClient.post<unknown>("/v1/ai/execute", payload);
    data = d;
  } catch (e) {
    if (isAxiosError(e) && e.response?.data !== undefined) {
      const parsed = parseSharedCoreAiExecuteResponse(e.response.data);
      if (!parsed.ok) {
        throw parsedFailureToInvokeError(parsed.value);
      }
    }
    throw new Error(formatAiContentTransportMessage("ai_execute_transport", axiosErrorDetail(e)));
  }

  const parsed = parseSharedCoreAiExecuteResponse(data);
  if (!parsed.ok) {
    throw parsedFailureToInvokeError(parsed.value);
  }
  return parsed.value;
}

function normalizeControllerAlignmentBundle(raw: unknown): ControllerAlignmentBundle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: ControllerAlignmentBundle = {};
  if (o.analyze && typeof o.analyze === "object") {
    out.analyze = o.analyze as ControllerAlignmentBundle["analyze"];
  }
  if (o.plan && typeof o.plan === "object") {
    out.plan = o.plan as ControllerAlignmentBundle["plan"];
  }
  return Object.keys(out).length ? out : undefined;
}

function mergeControllerAlignment(
  prev: ControllerAlignmentBundle | undefined,
  incoming: ControllerAlignmentBundle | undefined
): ControllerAlignmentBundle | undefined {
  if (!incoming) return prev;
  if (!prev) return incoming;
  return {
    analyze: incoming.analyze ?? prev.analyze,
    plan: incoming.plan ?? prev.plan
  };
}

export { mergeControllerAlignment };

function axiosErrorDetail(e: unknown): string {
  if (!isAxiosError(e)) return e instanceof Error ? e.message : "请求失败";
  const data = e.response?.data;
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (typeof obj.message === "string" && obj.message) return obj.message;
  const status = e.response?.status;
  return (status != null ? `HTTP ${status}: ` : "") + (e.message || "请求失败");
}

/** Workbench 附件轻量描述（历史类型名 OnCore；用于 **本地** analyze/plan，非远端 /analyze） */
export type AnalyzeOnCoreAttachment = {
  name?: string;
  mimeType?: string;
  size?: number;
};

function wireAttachmentsToTaskMeta(att?: AnalyzeOnCoreAttachment[]): TaskAttachmentMeta[] | undefined {
  if (!att?.length) return undefined;
  return att.map((a, i) => ({
    id: `wire_${i}`,
    name: (String(a.name ?? "").trim() || `attachment_${i}`).slice(0, 512),
    size: typeof a.size === "number" && Number.isFinite(a.size) ? Math.max(0, a.size) : 0,
    mimeType:
      typeof a.mimeType === "string" && a.mimeType.trim()
        ? a.mimeType.trim()
        : "application/octet-stream"
  }));
}

export type AnalyzeOnCoreInput = {
  prompt: string;
  requestedMode?: TaskMode;
  attachments?: AnalyzeOnCoreAttachment[];
  /** D-4：Workbench 组装的轻量 Memory hints（正式 /memory 契约） */
  memoryHints?: CoreMemoryHintsWire;
  /** Controller v1：本地对拍与审计预留 */
  controllerDecision?: ControllerPlanV1;
};

/** Task Clarification v1：预留（若未来接回服务端澄清流） */
export type ClarificationQuestion = {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
};

export type AnalyzeTaskOnCoreResult =
  | {
      success: true;
      requireClarification: true;
      questions: ClarificationQuestion[];
      analysis: TaskAnalysisResult;
      trust?: ExecutionTrustAssessment;
      controllerAlignment?: ControllerAlignmentBundle;
      routerDecision?: RouterDecision;
    }
  | {
      success: true;
      analysis: TaskAnalysisResult;
      trust?: ExecutionTrustAssessment;
      controllerAlignment?: ControllerAlignmentBundle;
      routerDecision?: RouterDecision;
    };

/** 本地 plan 入参（历史标签 OnCore） */
export type PlanOnCoreInput = {
  prompt: string;
  requestedMode?: TaskMode;
  attachments?: AnalyzeOnCoreAttachment[];
  /** 有则直接规划；无则先本地 analyze */
  analysis?: TaskAnalysisResult;
  memoryHints?: CoreMemoryHintsWire;
  controllerDecision?: ControllerPlanV1;
};

/** 本地 safety 入参（历史标签 OnCore） */
export type SafetyCheckOnCoreInput = {
  prompt: string;
  analysis?: TaskAnalysisResult;
  plan?: TaskPlan;
};

/**
 * D-7-3B：Workbench Analyzer — **本地规则**（`analyzeTask`）；无网络依赖。
 */
export async function analyzeTaskOnCore(input: AnalyzeOnCoreInput): Promise<AnalyzeTaskOnCoreResult> {
  void input.controllerDecision;
  void input.memoryHints;
  const analysis = analyzeTask({
    prompt: input.prompt,
    attachments: wireAttachmentsToTaskMeta(input.attachments),
    requestedMode: input.requestedMode
  });
  return { success: true, analysis };
}

/**
 * D-7-3D：Workbench Planner — **本地** `planTask` → `executionPlanToTaskPlanMirror`（`TaskPlan`），替代旧 `POST /plan`。
 */
export async function planTaskOnCore(input: PlanOnCoreInput): Promise<{
  success: true;
  analysis: TaskAnalysisResult;
  plan: TaskPlan;
  trust?: ExecutionTrustAssessment;
  controllerAlignment?: ControllerAlignmentBundle;
  routerDecision?: RouterDecision;
}> {
  void input.controllerDecision;
  void input.memoryHints;
  const analysis =
    input.analysis ??
    analyzeTask({
      prompt: input.prompt,
      attachments: wireAttachmentsToTaskMeta(input.attachments),
      requestedMode: input.requestedMode
    });
  const ep = planTask(analysis, { taskId: "workbench-plan-local" });
  const plan = executionPlanToTaskPlanMirror(ep);
  return { success: true, analysis, plan };
}

/**
 * P3：Content Intelligence 预检 — 仅本地可解释启发式（`runIntelPreFlight`），不调用旧网关。
 */
export async function contentIntelPreflightOnCore(input: {
  prompt: string;
  historyItems: HistoryListItemDto[];
}): Promise<IntelOrchestrationTrace> {
  return runIntelPreFlight(input.prompt.trim(), input.historyItems);
}

/**
 * D-7-3E：Workbench Safety — **本地** `runSafetyCheck`，替代旧 `POST /safety-check`。
 */
export async function safetyCheckOnCore(
  input: SafetyCheckOnCoreInput
): Promise<{ success: true; safety: SafetyCheckResult }> {
  const analysis =
    input.analysis ??
    analyzeTask({
      prompt: input.prompt,
      requestedMode: "auto"
    });
  const plan =
    input.plan ??
    executionPlanToTaskPlanMirror(planTask(analysis, { taskId: "safety-check-local" }));
  const safety = runSafetyCheck({ prompt: input.prompt, plan });
  return { success: true, safety };
}

/** 本地 permission 入参（历史标签 OnCore） */
export type PermissionCheckOnCoreInput = {
  capabilityId: string;
  userGrantedPermissions?: PermissionKey[];
  platformEnabledPermissions?: PermissionKey[];
};

/**
 * D-7-3F：Workbench Permission — **本地** `checkPermissions` + `permissionRegistry`，替代旧 `POST /permission-check`。
 */
export async function permissionCheckOnCore(
  input: PermissionCheckOnCoreInput
): Promise<{ success: true; permission: PermissionCheckResult }> {
  const capabilityRequiredPermissions = getCapabilityPermissions(input.capabilityId) ?? [];
  const permission = checkPermissions({
    capabilityId: input.capabilityId,
    userGrantedPermissions: input.userGrantedPermissions ?? [],
    platformEnabledPermissions: input.platformEnabledPermissions ?? [],
    capabilityRequiredPermissions
  });
  return { success: true, permission };
}

/** D-2：Memory 写入载荷 — 须经 memoryWriteService 收口；由 `postMemoryRecordToCore` 映射到 `POST /v1/memory/entries`。 */
export type PostMemoryRecordToCoreInput = {
  prompt: string;
  memoryType?: string;
  memoryId?: string;
  key?: string;
  value?: unknown;
  source?: string;
  sourceId?: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
  requestedMode?: string;
  resolvedMode?: string;
  intent?: string;
  planId?: string;
  stepIds?: string[];
  capabilityIds?: string[];
  resultKind?: string;
  success?: boolean;
};

/**
 * D-2：行为摘要写入 Shared Core `POST /v1/memory/entries`（`appendMemoryEntry`）。
 * **禁止** 业务页面 / 会话钩子直调；统一经 `modules/memory/memoryWriteService`。
 */
export async function postMemoryRecordToCore(
  input: PostMemoryRecordToCoreInput
): Promise<{ success: true }> {
  const key = (input.key ?? `mem:${String(input.memoryType ?? "note")}`).trim().slice(0, 200);
  if (!key) throw new Error("memory_key_required");

  const value: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && v.trim() === "") return;
    value[k] = v;
  };
  put("memoryType", input.memoryType);
  put("prompt", input.prompt?.trim());
  put("source", input.source);
  put("sourceId", input.sourceId);
  put("memoryId", input.memoryId);
  put("requestedMode", input.requestedMode);
  put("resolvedMode", input.resolvedMode);
  put("intent", input.intent);
  put("planId", input.planId);
  if (Array.isArray(input.stepIds)) value.stepIds = input.stepIds;
  if (Array.isArray(input.capabilityIds)) value.capabilityIds = input.capabilityIds;
  put("resultKind", input.resultKind);
  if (typeof input.success === "boolean") value.success = input.success;
  put("createdAt", input.createdAt);
  put("updatedAt", input.updatedAt);
  if (typeof input.isActive === "boolean") value.isActive = input.isActive;
  if (input.value !== undefined) value.payload = input.value;

  let raw: unknown;
  try {
    const { data } = await apiClient.post<unknown>("/v1/memory/entries", { key, value });
    raw = data;
  } catch (e) {
    if (isAxiosError(e) && e.response?.data && typeof e.response.data === "object") {
      const d = e.response.data as Record<string, unknown>;
      const msg = typeof d.message === "string" ? d.message : "memory_append_failed";
      throw new Error(msg);
    }
    throw e instanceof Error ? e : new Error(axiosErrorDetail(e));
  }
  const inner = normalizeV1ResponseBody(raw) as Record<string, unknown> | null;
  if (!inner || typeof inner !== "object" || inner.item == null) {
    throw new Error("memory_append_invalid_response");
  }
  return { success: true };
}
