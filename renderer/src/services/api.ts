import { isAxiosError } from "axios";
import type { TaskAnalysisResult } from "../modules/workbench/analyzer/taskAnalyzerTypes";
import type { TaskPlan } from "../modules/workbench/planner/taskPlanTypes";
import type { SafetyCheckResult } from "../modules/safety/safetyTypes";
import type {
  PermissionCheckResult,
  PermissionKey
} from "../modules/permissions/permissionTypes";
import type { TaskResult } from "../modules/result/resultTypes";
import type { ParsedAiContentSuccess } from "../modules/ai/aiContentWireTypes";
import {
  formatAiContentTransportMessage,
  parseAiContentGatewayJson,
  parsedFailureToInvokeError
} from "../modules/ai/parseAiContentWire";
import type { TaskMode } from "../types/taskMode";
import type { CoreMemoryHintsWire } from "../modules/memory/workbenchCoreMemoryHints";
import { AI_GATEWAY_BASE_URL } from "../config/runtimeEndpoints";
import { adaptCorePermissionPayload, adaptCoreSafetyPayload } from "./coreCheckAdapter";
import { aiGatewayClient } from "./apiClient";
import type { ExecutionTrustAssessment } from "../modules/trust/trustTypes";
import { normalizeExecutionTrust } from "../modules/trust/trustTypes";
import type {
  ControllerAlignmentBundle,
  ControllerPlanV1
} from "../modules/controller";
import type { IntelOrchestrationTrace } from "../modules/contentIntelligence/types";
import type { HistoryListItemDto } from "./history.api";
import type { RouterDecision } from "../modules/router/routerTypes";

function normalizeRouterDecision(raw: unknown): RouterDecision | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const executionMode = o.executionMode;
  if (executionMode !== "cloud_ai" && executionMode !== "local_only" && executionMode !== "hybrid") {
    return undefined;
  }
  if (typeof o.model !== "string" || typeof o.reason !== "string") return undefined;
  const praw = o.params;
  const p = praw && typeof praw === "object" ? (praw as Record<string, unknown>) : {};
  const temperature = typeof p.temperature === "number" ? p.temperature : 0.7;
  const maxTokens = typeof p.maxTokens === "number" ? p.maxTokens : 2000;
  const fbRaw = o.fallback;
  const fallback =
    fbRaw && typeof fbRaw === "object"
      ? { mode: String((fbRaw as Record<string, unknown>).mode ?? "") }
      : undefined;
  return {
    executionMode,
    model: o.model,
    params: { temperature, maxTokens },
    reason: o.reason,
    ...(fallback?.mode ? { fallback } : {})
  };
}

/**
 * D-7-3A：AI 网关经 `aiGatewayClient`（MODULE C-2：与 Shared Core `apiClient` 同源请求头策略）。
 * D-7-4Z：本文件所指服务为 **secondary persistence / audit / 旁路增强**；**权威执行真相源**为 `useExecutionSession` 本地会话，网关成败不反向定义执行是否启动或成功。
 * D-7-5A：基址见 `config/runtimeEndpoints`（`AI_GATEWAY_BASE_URL`）。
 */
export const API_BASE_URL = AI_GATEWAY_BASE_URL;

/** G-1：POST /ai/content — 经 AI 网关统一 Router（桌面禁止直连模型） */
export type InvokeAiContentOnCoreInput = {
  action: "generate" | "summarize";
  prompt: string;
};

export type InvokeAiContentOnCoreResult = ParsedAiContentSuccess;

/**
 * G-1A：调用 Core `/ai/content` — 响应仅经 `parseAiContentGatewayJson` 归一（generate / summarize 同源策略）。
 * 业务失败与非法成功响应均抛错 → 执行步 error，无假完成。
 */
export async function invokeAiContentOnCore(
  input: InvokeAiContentOnCoreInput
): Promise<InvokeAiContentOnCoreResult> {
  const payload = { action: input.action, prompt: input.prompt };
  let data: unknown;
  try {
    const { data: d } = await aiGatewayClient.post<unknown>("/ai/content", payload);
    data = d;
  } catch (e) {
    if (isAxiosError(e) && e.response?.data !== undefined) {
      const parsed = parseAiContentGatewayJson(e.response.data);
      if (!parsed.ok) {
        throw parsedFailureToInvokeError(parsed.value);
      }
    }
    throw new Error(
      formatAiContentTransportMessage("ai_content_transport", axiosErrorDetail(e))
    );
  }

  const parsed = parseAiContentGatewayJson(data);
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

/** D-7-3B：POST /analyze 请求体（附件仅元数据） */
export type AnalyzeOnCoreAttachment = {
  name?: string;
  mimeType?: string;
  size?: number;
};

export type AnalyzeOnCoreInput = {
  prompt: string;
  requestedMode?: TaskMode;
  attachments?: AnalyzeOnCoreAttachment[];
  /** D-4：Workbench 组装的轻量 Memory hints（正式 /memory 契约） */
  memoryHints?: CoreMemoryHintsWire;
  /** Controller v1：进入 Core 请求上下文，用于对拍与审计 */
  controllerDecision?: ControllerPlanV1;
};

/** Task Clarification v1：与 Core `/analyze` 的 `questions` 对齐 */
export type ClarificationQuestion = {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
};

function normalizeClarificationQuestions(raw: unknown): ClarificationQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ClarificationQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const key = typeof o.key === "string" ? o.key.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!key || !label) continue;
    const optsIn = o.options;
    if (!Array.isArray(optsIn)) continue;
    const options: Array<{ value: string; label: string }> = [];
    for (const opt of optsIn) {
      if (!opt || typeof opt !== "object") continue;
      const op = opt as Record<string, unknown>;
      const value = typeof op.value === "string" ? op.value.trim() : "";
      const ol = typeof op.label === "string" ? op.label.trim() : "";
      if (value && ol) options.push({ value, label: ol });
    }
    if (!options.length) continue;
    const dvRaw = typeof o.defaultValue === "string" ? o.defaultValue.trim() : "";
    const defaultValue = options.some((x) => x.value === dvRaw) ? dvRaw : options[0]!.value;
    out.push({ key, label, options, defaultValue });
  }
  return out;
}

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

/** D-7-3D：POST /plan */
export type PlanOnCoreInput = {
  prompt: string;
  requestedMode?: TaskMode;
  attachments?: AnalyzeOnCoreAttachment[];
  /** 有则后端直接规划；无则后端先 analyze */
  analysis?: TaskAnalysisResult;
  memoryHints?: CoreMemoryHintsWire;
  controllerDecision?: ControllerPlanV1;
};

/** D-7-3E：POST /safety-check */
export type SafetyCheckOnCoreInput = {
  prompt: string;
  analysis?: TaskAnalysisResult;
  plan?: TaskPlan;
};

export type CoreTaskResponse = {
  success?: boolean;
  message?: string;
  [key: string]: unknown;
};

/**
 * POST /task — 提交用户 prompt，JSON body `{ prompt }`。
 * 失败时抛错；**不得**用作是否 `session.start` 的门闩 — 请用 `recordTaskPromptToAiGatewayBestEffort`。
 */
export async function sendTaskToCore(
  prompt: string,
  extras?: { routerDecision?: RouterDecision }
): Promise<CoreTaskResponse> {
  try {
    const body: Record<string, unknown> = { prompt };
    if (extras?.routerDecision != null) body.routerDecision = extras.routerDecision;
    const { data } = await aiGatewayClient.post<CoreTaskResponse>("/task", body);
    return (data && typeof data === "object" ? data : {}) as CoreTaskResponse;
  } catch (e) {
    throw new Error(axiosErrorDetail(e));
  }
}

/**
 * D-7-4Z：`POST /task` 仅作旁路记录；**不影响**本地会话启动/成败，失败只打日志（不抛错）。
 */
export async function recordTaskPromptToAiGatewayBestEffort(
  prompt: string,
  routerDecision?: RouterDecision
): Promise<void> {
  const p = prompt.trim();
  if (!p) return;
  try {
    const data = await sendTaskToCore(p, routerDecision != null ? { routerDecision } : undefined);
    if (import.meta.env.DEV) {
      console.log("[D-7-4Z] AI gateway /task record ok", data?.success === true, data?.message);
    }
  } catch (e) {
    console.error(
      "[D-7-4Z] AI gateway /task record failed (local session unaffected)",
      e instanceof Error ? e.message : e
    );
  }
}

/**
 * D-7-3B：POST /analyze — Core Backend 规则版 Analyzer。
 * 失败时抛错，由调用方捕获以保证不阻塞本地 session。
 * Task Clarification：可能返回 `requireClarification` + `questions`（须先于 TrustGate 处理）。
 */
export async function analyzeTaskOnCore(input: AnalyzeOnCoreInput): Promise<AnalyzeTaskOnCoreResult> {
  const payload: Record<string, unknown> = { prompt: input.prompt };
  if (input.requestedMode != null) payload.requestedMode = input.requestedMode;
  if (input.attachments?.length) payload.attachments = input.attachments;
  if (input.memoryHints && Object.keys(input.memoryHints).length > 0) {
    payload.memoryHints = input.memoryHints;
  }
  if (input.controllerDecision != null) {
    payload.controllerDecision = input.controllerDecision;
  }

  let obj: Record<string, unknown>;
  try {
    const { data } = await aiGatewayClient.post<unknown>("/analyze", payload);
    obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch (e) {
    throw new Error(axiosErrorDetail(e));
  }

  if (obj.success !== true) {
    const msg =
      "message" in obj && typeof obj.message === "string" ? obj.message : "invalid analyze response";
    throw new Error(msg);
  }

  if (obj.requireClarification === true) {
    const questions = normalizeClarificationQuestions(obj.questions);
    if (
      questions.length > 0 &&
      obj.analysis &&
      typeof obj.analysis === "object"
    ) {
      const trust = normalizeExecutionTrust(obj.trust) ?? undefined;
      const controllerAlignment = normalizeControllerAlignmentBundle(obj.controllerAlignment);
      const routerDecision = normalizeRouterDecision(obj.routerDecision);
      return {
        success: true,
        requireClarification: true,
        questions,
        analysis: obj.analysis as TaskAnalysisResult,
        ...(trust ? { trust } : {}),
        ...(controllerAlignment ? { controllerAlignment } : {}),
        ...(routerDecision ? { routerDecision } : {})
      };
    }
  }

  if (!obj.analysis || typeof obj.analysis !== "object") {
    const msg =
      "message" in obj && typeof obj.message === "string" ? obj.message : "invalid analyze response";
    throw new Error(msg);
  }

  const trust = normalizeExecutionTrust(obj.trust) ?? undefined;
  const controllerAlignment = normalizeControllerAlignmentBundle(obj.controllerAlignment);
  const routerDecision = normalizeRouterDecision(obj.routerDecision);
  return {
    success: true,
    analysis: obj.analysis as TaskAnalysisResult,
    ...(trust ? { trust } : {}),
    ...(controllerAlignment ? { controllerAlignment } : {}),
    ...(routerDecision ? { routerDecision } : {})
  };
}

/**
 * D-7-3D：POST /plan — Core Backend 规则版 Planner。
 * 失败时抛错，由调用方捕获以保证不阻塞本地 session。
 */
export async function planTaskOnCore(input: PlanOnCoreInput): Promise<{
  success: true;
  analysis: TaskAnalysisResult;
  plan: TaskPlan;
  trust?: ExecutionTrustAssessment;
  controllerAlignment?: ControllerAlignmentBundle;
  routerDecision?: RouterDecision;
}> {
  const payload: Record<string, unknown> = { prompt: input.prompt };
  if (input.requestedMode != null) payload.requestedMode = input.requestedMode;
  if (input.attachments?.length) payload.attachments = input.attachments;
  if (input.analysis != null) payload.analysis = input.analysis;
  if (input.memoryHints && Object.keys(input.memoryHints).length > 0) {
    payload.memoryHints = input.memoryHints;
  }
  if (input.controllerDecision != null) {
    payload.controllerDecision = input.controllerDecision;
  }

  let obj: Record<string, unknown>;
  try {
    const { data } = await aiGatewayClient.post<unknown>("/plan", payload);
    obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch (e) {
    throw new Error(axiosErrorDetail(e));
  }

  if (
    obj.success !== true ||
    !obj.analysis ||
    typeof obj.analysis !== "object" ||
    !obj.plan ||
    typeof obj.plan !== "object"
  ) {
    const msg =
      "message" in obj && typeof obj.message === "string" ? obj.message : "invalid plan response";
    throw new Error(msg);
  }

  const trust = normalizeExecutionTrust(obj.trust) ?? undefined;
  const controllerAlignment = normalizeControllerAlignmentBundle(obj.controllerAlignment);
  const routerDecision = normalizeRouterDecision(obj.routerDecision);
  return {
    success: true,
    analysis: obj.analysis as TaskAnalysisResult,
    plan: obj.plan as TaskPlan,
    ...(trust ? { trust } : {}),
    ...(controllerAlignment ? { controllerAlignment } : {}),
    ...(routerDecision ? { routerDecision } : {})
  };
}

/**
 * Content Intelligence：POST /content-intelligence/preflight — 服务端权威预检（与 IntelOrchestrationTrace 对齐）。
 */
export async function contentIntelPreflightOnCore(input: {
  prompt: string;
  historyItems: HistoryListItemDto[];
}): Promise<IntelOrchestrationTrace> {
  const payload = {
    prompt: input.prompt.trim(),
    historyItems: input.historyItems.map((x) => ({
      historyId: x.historyId,
      prompt: x.prompt,
      preview: x.preview ?? "",
      status: x.status
    }))
  };
  let obj: Record<string, unknown>;
  try {
    const { data } = await aiGatewayClient.post<unknown>("/content-intelligence/preflight", payload);
    obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch (e) {
    throw new Error(axiosErrorDetail(e));
  }
  if (obj.success !== true || obj.trace == null || typeof obj.trace !== "object") {
    const msg =
      "message" in obj && typeof obj.message === "string" ? obj.message : "invalid preflight response";
    throw new Error(msg);
  }
  return obj.trace as IntelOrchestrationTrace;
}

/**
 * D-7-3E：POST /safety-check — Core 规则版 Safety。
 * 失败时抛错，由调用方捕获以保证不阻塞本地 session。
 */
export async function safetyCheckOnCore(
  input: SafetyCheckOnCoreInput
): Promise<{ success: true; safety: SafetyCheckResult }> {
  const payload: Record<string, unknown> = { prompt: input.prompt };
  if (input.analysis != null) payload.analysis = input.analysis;
  if (input.plan != null) payload.plan = input.plan;

  let obj: Record<string, unknown>;
  try {
    const { data } = await aiGatewayClient.post<unknown>("/safety-check", payload);
    obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch (e) {
    throw new Error(axiosErrorDetail(e));
  }

  if (obj.success !== true) {
    const msg =
      "message" in obj && typeof obj.message === "string" ? obj.message : "invalid safety response";
    throw new Error(msg);
  }

  const safety = adaptCoreSafetyPayload(obj.safety);
  if (!safety) {
    throw new Error("invalid safety payload");
  }

  return { success: true, safety };
}

/** D-7-3F：POST /permission-check */
export type PermissionCheckOnCoreInput = {
  capabilityId: string;
  userGrantedPermissions?: PermissionKey[];
  platformEnabledPermissions?: PermissionKey[];
};

/**
 * D-7-3F：Core 规则版 Permission。
 * 失败时抛错，由调用方捕获以保证不阻塞本地 session。
 */
export async function permissionCheckOnCore(
  input: PermissionCheckOnCoreInput
): Promise<{ success: true; permission: PermissionCheckResult }> {
  const payload: Record<string, unknown> = {
    capabilityId: input.capabilityId,
    userGrantedPermissions: input.userGrantedPermissions ?? []
  };
  if (input.platformEnabledPermissions != null) {
    payload.platformEnabledPermissions = input.platformEnabledPermissions;
  }

  let obj: Record<string, unknown>;
  try {
    const { data } = await aiGatewayClient.post<unknown>("/permission-check", payload);
    obj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch (e) {
    throw new Error(axiosErrorDetail(e));
  }

  if (obj.success !== true) {
    const msg =
      "message" in obj && typeof obj.message === "string"
        ? obj.message
        : "invalid permission response";
    throw new Error(msg);
  }

  const permission = adaptCorePermissionPayload(obj.permission);
  if (!permission) {
    throw new Error("invalid permission payload");
  }

  return { success: true, permission };
}

/** D-7-3G：POST /result */
export type PostResultToCoreInput = {
  runId?: string;
  prompt: string;
  result: TaskResult;
  stepResults?: Record<string, TaskResult>;
};

/** D-7-3G / D-2：POST /memory-record — 须经 memoryWriteService 收口（禁止页面直拼任意 body） */
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

function assertCoreWriteBody(body: unknown): void {
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (obj.success !== true) {
    const msg =
      "message" in obj && typeof obj.message === "string" ? obj.message : "invalid response";
    throw new Error(msg);
  }
}

/**
 * D-7-3G：归档 TaskResult 到 Core（失败抛错，由调用方 void/catch）。
 */
export async function postResultToCore(input: PostResultToCoreInput): Promise<{ success: true }> {
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    result: input.result
  };
  if (input.runId != null) payload.runId = input.runId;
  if (input.stepResults != null) payload.stepResults = input.stepResults;

  let body: unknown;
  try {
    const { data } = await aiGatewayClient.post<unknown>("/result", payload);
    body = data;
  } catch (e) {
    if (isAxiosError(e)) body = e.response?.data;
    else throw e instanceof Error ? e : new Error(axiosErrorDetail(e));
  }
  assertCoreWriteBody(body);
  return { success: true };
}

/**
 * D-7-3G / D-2：行为摘要写入 AICS Core Memory。
 * **禁止** 业务页面 / 会话钩子直调；统一经 `modules/memory/memoryWriteService`。
 */
export async function postMemoryRecordToCore(
  input: PostMemoryRecordToCoreInput
): Promise<{ success: true }> {
  let body: unknown;
  try {
    const { data } = await aiGatewayClient.post<unknown>("/memory-record", input);
    body = data;
  } catch (e) {
    if (isAxiosError(e)) body = e.response?.data;
    else throw e instanceof Error ? e : new Error(axiosErrorDetail(e));
  }
  assertCoreWriteBody(body);
  return { success: true };
}
