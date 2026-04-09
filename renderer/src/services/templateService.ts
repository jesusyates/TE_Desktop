/**
 * D-7-4C / E-1：模板读写的统一收口（系统内置 + 用户 localStorage）。
 * — **Templates 列表页**：以 `coreTemplateService.fetchTemplateList`（GET /templates/list）为正式来源。
 * — **工作台 bootstrap**：E-3 起主路径为 `coreTemplateService.fetchTemplateById`；本处 `getTemplateWorkbenchBootstrap` 仅保留兼容/应急，不得作为常规入口。
 */

import type { TaskMode } from "../types/taskMode";
import {
  appendTemplateToLibraryWithServerId,
  loadTemplatesFromStorage
} from "../modules/templates/storage/localTemplateStore";
import { saveTemplateToCore } from "./coreTemplateService";
import { clientSession } from "./clientSession";
import type { MemoryHintsTemplateContext } from "../modules/memory/memoryTypes";
import { recordTemplateSavedMemorySignal } from "../modules/memory/memoryTemplateSignals";
import type { SaveTemplateFromTaskInput, Template } from "../modules/templates/types/template";
import { templateListLikeToDomainModel } from "../domain/mappers/templateMapper";
import type { TemplateDomainModel } from "../domain/models/templateDomainModel";

export type { TemplateDomainModel };

export type TemplateSource = "system" | "user";

/** 列表最小形态（与产品字段对齐） */
export type TemplateListItem = {
  id: string;
  name: string;
  description?: string;
  platform?: string;
  workflowType?: string;
  updatedAt: string;
  source: TemplateSource;
};

export type TemplateWorkbenchBootstrap = {
  sourcePrompt: string;
  displayName: string;
  requestedMode: TaskMode;
};

type SystemDef = {
  summary: TemplateListItem;
  sourcePrompt: string;
};

function mapWorkflowToMode(w?: string): TaskMode {
  const wk = (w ?? "").toLowerCase().trim();
  if (wk === "content") return "content";
  if (wk === "computer" || wk === "automation") return "computer";
  return "auto";
}

/** 内置少量系统模板（仅占代码，不写入 localStorage） */
const SYSTEM_TEMPLATE_DEFS: SystemDef[] = [
  {
    summary: {
      id: "sys-short-video-copy",
      name: "短视频文案骨架",
      description: "按主题生成钩子、结构、正文要点与发布建议",
      platform: "generic",
      workflowType: "content",
      updatedAt: "2026-01-15T00:00:00.000Z",
      source: "system"
    },
    sourcePrompt:
      "主题：【在此填写】\n请生成一条短视频文案：包含 Hook、内容结构大纲、正文要点、标签与发布建议。"
  },
  {
    summary: {
      id: "sys-product-bullet",
      name: "产品卖点清单",
      description: "从一句话产品信息扩展卖点条列",
      platform: "generic",
      workflowType: "content",
      updatedAt: "2026-01-14T00:00:00.000Z",
      source: "system"
    },
    sourcePrompt:
      "产品/服务：【在此填写】\n请输出：核心受众、3–5 条卖点、一句行动号召（CTA）。"
  },
  {
    summary: {
      id: "sys-computer-organize",
      name: "桌面文件整理（Computer）",
      description: "偏向本地执行的整理类任务入口",
      platform: "desktop",
      workflowType: "computer",
      updatedAt: "2026-01-13T00:00:00.000Z",
      source: "system"
    },
    sourcePrompt: "请根据我的说明整理指定文件夹中的文件（路径与规则在正文中补充）。"
  }
];

function userRowToListItem(t: Template): TemplateListItem {
  return {
    id: t.id,
    name: t.name,
    description: t.description?.trim() || undefined,
    platform: t.platform,
    workflowType: t.workflowType,
    updatedAt: (t.lastUsedAt || t.createdAt).trim(),
    source: "user"
  };
}

/** 合并排序后的模板摘要列表（系统在前分组可由 UI 再分，此处按 updatedAt 降序） */
export function listTemplateSummaries(): TemplateListItem[] {
  const system = SYSTEM_TEMPLATE_DEFS.map((d) => d.summary);
  const user = loadTemplatesFromStorage().map(userRowToListItem);
  return [...system, ...user].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** D-7-4T：与 {@link listTemplateSummaries} 同源，出口为 TemplateDomainModel（供 UI / 后续编排试点）。 */
export function listTemplateDomainSummaries(): TemplateDomainModel[] {
  return listTemplateSummaries().map((row) => templateListLikeToDomainModel(row));
}

function findSystemDef(id: string): SystemDef | undefined {
  return SYSTEM_TEMPLATE_DEFS.find((d) => d.summary.id === id);
}

function findUserTemplate(id: string): Template | undefined {
  return loadTemplatesFromStorage().find((t) => t.id === id);
}

/** D-7-4N：本会话内「刚保存过模板」的 task/run 键（刷新后仅依赖本地库） */
const templateSavedSessionKeys = new Set<string>();

export function noteTemplateSavedForSource(sourceTaskId: string, sourceRunId?: string | null): void {
  const t = sourceTaskId.trim();
  if (!t) return;
  templateSavedSessionKeys.add(t);
  const r = sourceRunId?.trim();
  if (r) templateSavedSessionKeys.add(`${t}::${r}`);
}

function userTemplatesHasSourceMatch(taskId: string, runId?: string | null): boolean {
  for (const row of loadTemplatesFromStorage()) {
    if (row.sourceTaskId.trim() !== taskId) continue;
    if (!runId?.trim()) return true;
    if (row.sourceRunId?.trim() === runId.trim()) return true;
    if (!row.sourceRunId?.trim()) return true;
  }
  return false;
}

/**
 * D-7-4N：当前任务/运行是否已有用户模板（本地库 + 会话内标记）。
 */
export function hasTemplateSavedForSource(sourceTaskId: string, sourceRunId?: string | null): boolean {
  const t = sourceTaskId.trim();
  if (!t) return false;
  if (templateSavedSessionKeys.has(t)) return true;
  const r = sourceRunId?.trim();
  if (r && templateSavedSessionKeys.has(`${t}::${r}`)) return true;
  return userTemplatesHasSourceMatch(t, r ?? null);
}

/** D-7-4M / E-3：供 memory hints 匹配模板元数据；`workflowTypeHint` 优先（来自 Core content.requestedMode） */
export function getTemplateMemoryContext(
  templateId: string | undefined,
  opts?: { workflowTypeHint?: string }
): MemoryHintsTemplateContext | null {
  const tid = templateId?.trim();
  if (!tid) return null;
  const hint = opts?.workflowTypeHint?.trim();
  if (hint === "content" || hint === "computer") {
    return { templateId: tid, workflowType: hint };
  }
  const row = listTemplateSummaries().find((s) => s.id === tid);
  return {
    templateId: tid,
    workflowType: row?.workflowType
  };
}

/**
 * 应急：工作台在无 Core 时的本地副本填充（E-3 常规路径禁止依赖）。
 * 不含与 Core `content` 对齐保证；勿用于消除「模板加载失败」。
 */
export function getTemplateWorkbenchBootstrap(templateId: string): TemplateWorkbenchBootstrap | null {
  const tid = templateId.trim();
  if (!tid) return null;

  const sys = findSystemDef(tid);
  if (sys) {
    return {
      sourcePrompt: sys.sourcePrompt,
      displayName: sys.summary.name,
      requestedMode: mapWorkflowToMode(sys.summary.workflowType)
    };
  }

  const user = findUserTemplate(tid);
  if (user) {
    return {
      sourcePrompt: user.sourcePrompt,
      displayName: user.name,
      requestedMode: mapWorkflowToMode(user.workflowType)
    };
  }

  return null;
}

/**
 * E-2：先 POST /templates/save（正式入库），再以服务端 templateId 写入本地库供离线 bootstrap。
 */
export async function saveTemplateFromTask(input: SaveTemplateFromTaskInput): Promise<string> {
  const sessionMarket = await clientSession.getMarket();
  const sessionLocale = await clientSession.getLocale();
  const workflow = input.workflowType?.trim() || "content";
  const sourceResultId = input.sourceRunId?.trim() ?? "";
  const product = (input.product?.trim() || "aics") as "aics";
  const market = input.market?.trim() || sessionMarket;
  const locale = input.locale?.trim() || sessionLocale;
  const version = input.version?.trim() || "1";
  const audience = input.audience?.trim() || "general";
  const content: Record<string, unknown> = {
    v: 1,
    /** 与顶层 save 字段对齐的可审计副本（便于单对象回放与市场收敛） */
    formalMeta: {
      product,
      market,
      locale,
      workflowType: workflow,
      version,
      audience
    },
    sourcePrompt: input.sourcePrompt,
    requestedMode: mapWorkflowToMode(workflow),
    sourceResultKind: input.sourceResultKind ?? "none",
    stepsSnapshot: input.stepsSnapshot,
    resultSnapshot: input.resultSnapshot
  };
  const { templateId } = await saveTemplateToCore({
    templateType: "workflow",
    title: input.name.trim(),
    description: (input.description ?? "").trim(),
    product,
    market,
    locale,
    workflowType: workflow,
    version,
    audience,
    sourceTaskId: input.sourceTaskId.trim(),
    sourceResultId,
    content
  });
  const row = appendTemplateToLibraryWithServerId(
    { ...input, product, market, locale, version, audience },
    templateId
  );
  recordTemplateSavedMemorySignal(row);
  noteTemplateSavedForSource(input.sourceTaskId, input.sourceRunId ?? null);
  return templateId;
}

export {
  inferTemplateSaveMetadata,
  type InferredTemplateMetadata,
  type TemplateSaveInferenceContext,
  type TemplateSaveInferenceSeeds
} from "./templateMetadataInfer";
