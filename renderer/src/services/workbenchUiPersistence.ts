/**
 * D-7-5T（硬规则）：Workbench turn 列表 + 快照 — 切页/刷新/重启均以 localStorage 为准恢复。
 */

import type { ExecutionStatus } from "../execution/session/execution";
import { isExecutionTerminal } from "../execution/session/execution";
import {
  isControllerPlanV1,
  type ControllerAlignmentBundle,
  type ControllerPlanV1,
  type ControllerTemplateFormalMetaV1,
  type ControllerTemplateProvenanceV1
} from "../modules/controller";
import type { RouterDecision } from "../modules/router/routerTypes";

export const WORKBENCH_UI_STORAGE_KEY = "aics.workbenchUi.v1";

export type WorkbenchTurnStatus = ExecutionStatus | "pending";

/** 终态展示块（与扁平字段同步） */
export type WorkbenchTurnFrozen = {
  status: ExecutionStatus;
  errorMessage?: string;
  resultTitle?: string;
  resultBody?: string;
  resultKind?: "content" | "computer";
  /** D-7-6I：由 UI 写入，避免占位 success 被误认为真实完成 */
  isMockPlaceholder?: boolean;
};

/** 一条 turn = 用户输入 + 状态/结果（进行中 status 随 session，终态写 frozen + 扁平字段） */
export type WorkbenchExecutionSourceV1 = {
  usedTemplate: boolean;
  usedMemory: boolean;
  usedLocalRuntime: boolean;
};

export type WorkbenchUiTurn = {
  id: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  status: WorkbenchTurnStatus;
  error?: string;
  resultTitle?: string;
  resultBody?: string;
  resultKind?: "content" | "computer";
  frozen: WorkbenchTurnFrozen | null;
  /** Controller 决策引擎 v1：结构化计划（含步骤态，可回放） */
  controllerPlan?: ControllerPlanV1 | null;
  /** 本轮执行侧来源标记（结果区 / 冻结展示） */
  executionSource?: WorkbenchExecutionSourceV1 | null;
  /** Controller ↔ Core analyze/plan 对拍（审计） */
  coreControllerAlignment?: ControllerAlignmentBundle | null;
  /** AI Router v1：模型与执行位置 */
  routerDecision?: RouterDecision | null;
};

export type WorkbenchPersistedSession = {
  currentTaskId: string;
  lastPrompt: string;
  status: ExecutionStatus;
};

/** E-3+：模板复用层在工作台刷新/恢复时的最小快照（与 Controller 计划中的摘要一致） */
export type WorkbenchTemplateContextV1 = {
  appliedTemplate: { templateId: string; displayName: string } | null;
  runSeedTemplateId: string | null;
  formalMeta?: ControllerTemplateFormalMetaV1;
};

export type WorkbenchUiSnapshot = {
  restoreVersion: 1 | 2;
  savedAt: string;
  turns: WorkbenchUiTurn[];
  liveTurnId: string | null;
  /** 硬规则字段名 */
  draftInput: string;
  /** 与 draftInput 同步，兼容旧版读取 */
  draftPrompt: string;
  session: WorkbenchPersistedSession;
  /** 可选：芯片 / 种子模板 id / 正式元数据摘要，供恢复后链路与下一拍 Controller 对齐 */
  templateContext?: WorkbenchTemplateContextV1 | null;
};

const EXEC_STATUSES: readonly ExecutionStatus[] = [
  "idle",
  "validating",
  "queued",
  "running",
  "paused",
  "stopping",
  "stopped",
  "success",
  "error"
] as const;

function isExecutionStatus(v: string): v is ExecutionStatus {
  return (EXEC_STATUSES as readonly string[]).includes(v);
}

function normalizeExecutionSource(raw: unknown): WorkbenchExecutionSourceV1 | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.usedTemplate !== "boolean") return undefined;
  if (typeof o.usedMemory !== "boolean") return undefined;
  if (typeof o.usedLocalRuntime !== "boolean") return undefined;
  return {
    usedTemplate: o.usedTemplate,
    usedMemory: o.usedMemory,
    usedLocalRuntime: o.usedLocalRuntime
  };
}

function normalizeTemplateFormalMeta(raw: unknown): ControllerTemplateFormalMetaV1 | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const pick = (k: string) => {
    const v = o[k];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const out: ControllerTemplateFormalMetaV1 = {
    product: pick("product"),
    market: pick("market"),
    locale: pick("locale"),
    workflowType: pick("workflowType"),
    version: pick("version"),
    audience: pick("audience")
  };
  return Object.values(out).some(Boolean) ? out : undefined;
}

function normalizeTemplateProvenance(raw: unknown): ControllerTemplateProvenanceV1 | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.source !== "template") return undefined;
  const templateId = typeof o.templateId === "string" ? o.templateId.trim() : "";
  const displayName = typeof o.displayName === "string" ? o.displayName.trim() : "";
  if (!templateId || !displayName) return undefined;
  const formalMeta = normalizeTemplateFormalMeta(o.formalMeta) ?? {};
  return { source: "template", templateId, displayName, formalMeta };
}

function normalizeControllerPlan(raw: unknown): ControllerPlanV1 | undefined {
  if (!isControllerPlanV1(raw)) return undefined;
  const p = raw as ControllerPlanV1 & { templateProvenance?: unknown };
  const { templateProvenance: _ignored, ...rest } = p;
  const templateProvenance = normalizeTemplateProvenance(p.templateProvenance);
  const graphBinding =
    p.graphBinding ?? (p.graphReserved ? "reserved_executes_as_linear_pipeline" : "none");
  const base: ControllerPlanV1 = {
    ...rest,
    graphBinding
  };
  return templateProvenance ? { ...base, templateProvenance } : base;
}

function normalizeTemplateContext(raw: unknown): WorkbenchTemplateContextV1 | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  let appliedTemplate: WorkbenchTemplateContextV1["appliedTemplate"] = null;
  if (o.appliedTemplate && typeof o.appliedTemplate === "object") {
    const a = o.appliedTemplate as Record<string, unknown>;
    const tid = typeof a.templateId === "string" ? a.templateId.trim() : "";
    const dn = typeof a.displayName === "string" ? a.displayName.trim() : "";
    if (tid && dn) appliedTemplate = { templateId: tid, displayName: dn };
  }
  const runSeed =
    o.runSeedTemplateId === null || o.runSeedTemplateId === undefined
      ? null
      : String(o.runSeedTemplateId).trim() || null;
  const formalMeta = normalizeTemplateFormalMeta(o.formalMeta);
  return {
    appliedTemplate,
    runSeedTemplateId: runSeed,
    ...(formalMeta ? { formalMeta } : {})
  };
}

function normalizeRouterDecisionPersisted(raw: unknown): RouterDecision | undefined {
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

function normalizeCoreControllerAlignment(raw: unknown): ControllerAlignmentBundle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: ControllerAlignmentBundle = {};
  if (o.analyze && typeof o.analyze === "object") out.analyze = o.analyze as ControllerAlignmentBundle["analyze"];
  if (o.plan && typeof o.plan === "object") out.plan = o.plan as ControllerAlignmentBundle["plan"];
  return Object.keys(out).length ? out : undefined;
}

function normalizeFrozen(raw: unknown): WorkbenchTurnFrozen | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const st = String(o.status ?? "");
  if (!isExecutionStatus(st) || !isExecutionTerminal(st)) return null;
  const resultKind = o.resultKind === "computer" ? "computer" : o.resultKind === "content" ? "content" : undefined;
  const isMockPlaceholder = o.isMockPlaceholder === true ? true : undefined;
  return {
    status: st,
    errorMessage: typeof o.errorMessage === "string" ? o.errorMessage : undefined,
    resultTitle: typeof o.resultTitle === "string" ? o.resultTitle : undefined,
    resultBody: typeof o.resultBody === "string" ? o.resultBody : undefined,
    resultKind,
    isMockPlaceholder
  };
}

/** 供冻结区组件：优先 frozen，否则用扁平终态字段 */
export function turnFrozenForDisplay(turn: WorkbenchUiTurn): WorkbenchTurnFrozen | null {
  if (turn.frozen) return turn.frozen;
  if (turn.status !== "pending" && isExecutionTerminal(turn.status)) {
    return {
      status: turn.status,
      errorMessage: turn.error,
      resultTitle: turn.resultTitle,
      resultBody: turn.resultBody,
      resultKind: turn.resultKind
    };
  }
  return null;
}

function normalizeTurns(raw: unknown): WorkbenchUiTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkbenchUiTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = String((item as { id?: unknown }).id ?? "").trim();
    const prompt = String((item as { prompt?: unknown }).prompt ?? "");
    if (!id) continue;
    const createdAtRaw = (item as { createdAt?: unknown }).createdAt;
    const createdAt =
      typeof createdAtRaw === "string" && createdAtRaw.trim()
        ? createdAtRaw.trim()
        : new Date().toISOString();
    const updatedAtRaw = (item as { updatedAt?: unknown }).updatedAt;
    const updatedAt =
      typeof updatedAtRaw === "string" && updatedAtRaw.trim() ? updatedAtRaw.trim() : createdAt;
    const frozen = normalizeFrozen((item as { frozen?: unknown }).frozen);
    const statusRaw = String((item as { status?: unknown }).status ?? "");
    let status: WorkbenchTurnStatus = "pending";
    if (statusRaw === "pending") status = "pending";
    else if (isExecutionStatus(statusRaw)) status = statusRaw;
    else if (frozen) status = frozen.status;
    const error = typeof (item as { error?: unknown }).error === "string" ? (item as { error: string }).error : frozen?.errorMessage;
    const resultTitle =
      typeof (item as { resultTitle?: unknown }).resultTitle === "string"
        ? (item as { resultTitle: string }).resultTitle
        : frozen?.resultTitle;
    const resultBody =
      typeof (item as { resultBody?: unknown }).resultBody === "string"
        ? (item as { resultBody: string }).resultBody
        : frozen?.resultBody;
    const resultKind =
      (item as { resultKind?: unknown }).resultKind === "computer"
        ? "computer"
        : (item as { resultKind?: unknown }).resultKind === "content"
          ? "content"
          : frozen?.resultKind;
    const controllerPlan = normalizeControllerPlan((item as { controllerPlan?: unknown }).controllerPlan);
    const executionSource = normalizeExecutionSource((item as { executionSource?: unknown }).executionSource);
    const coreControllerAlignment = normalizeCoreControllerAlignment(
      (item as { coreControllerAlignment?: unknown }).coreControllerAlignment
    );
    const routerDecision = normalizeRouterDecisionPersisted((item as { routerDecision?: unknown }).routerDecision);
    out.push({
      id,
      prompt,
      createdAt,
      updatedAt,
      status,
      error,
      resultTitle,
      resultBody,
      resultKind,
      frozen,
      ...(controllerPlan !== undefined ? { controllerPlan } : {}),
      ...(executionSource !== undefined ? { executionSource } : {}),
      ...(coreControllerAlignment !== undefined ? { coreControllerAlignment } : {}),
      ...(routerDecision !== undefined ? { routerDecision } : {})
    });
  }
  return out;
}

export function loadWorkbenchUiSnapshot(): WorkbenchUiSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WORKBENCH_UI_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<WorkbenchUiSnapshot>;
    if (!o || typeof o !== "object") return null;
    const turns = normalizeTurns(o.turns);
    const liveTurnId =
      o.liveTurnId === null || o.liveTurnId === undefined
        ? null
        : String(o.liveTurnId).trim() || null;
    const draftFromInput = typeof o.draftInput === "string" ? o.draftInput : "";
    const draftFromLegacy = typeof o.draftPrompt === "string" ? o.draftPrompt : "";
    const draftInput = draftFromInput || draftFromLegacy;
    let session: WorkbenchPersistedSession = {
      currentTaskId: "",
      lastPrompt: "",
      status: "idle"
    };
    if (o.session && typeof o.session === "object") {
      const tid = String((o.session as { currentTaskId?: unknown }).currentTaskId ?? "").trim();
      const lp = String((o.session as { lastPrompt?: unknown }).lastPrompt ?? "");
      const st = String((o.session as { status?: unknown }).status ?? "idle");
      const status = isExecutionStatus(st) ? st : "idle";
      session = { currentTaskId: tid, lastPrompt: lp, status };
    }
    const rv = o.restoreVersion === 2 ? 2 : 1;
    const templateContext = normalizeTemplateContext(o.templateContext);
    return {
      restoreVersion: rv,
      savedAt: typeof o.savedAt === "string" ? o.savedAt : new Date().toISOString(),
      turns,
      liveTurnId,
      draftInput,
      draftPrompt: draftInput,
      session,
      ...(templateContext ? { templateContext } : {})
    };
  } catch {
    return null;
  }
}

export function persistWorkbenchUiSnapshot(s: WorkbenchUiSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const draft = s.draftInput ?? s.draftPrompt ?? "";
    const payload: WorkbenchUiSnapshot = {
      ...s,
      restoreVersion: 2,
      savedAt: new Date().toISOString(),
      draftInput: draft,
      draftPrompt: draft,
      ...(s.templateContext !== undefined ? { templateContext: s.templateContext } : {})
    };
    window.localStorage.setItem(WORKBENCH_UI_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function executionStatusToBackendPersistence(s: ExecutionStatus): string {
  switch (s) {
    case "success":
      return "success";
    case "error":
      return "failed";
    case "stopped":
      return "cancelled";
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "stopping":
      return "stopping";
    case "validating":
    case "queued":
      return "pending";
    case "idle":
    default:
      return "ready";
  }
}
