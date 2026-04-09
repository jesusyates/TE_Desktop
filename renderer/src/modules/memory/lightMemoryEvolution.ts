/**
 * Memory Evolution v1：任务结果 → localStorage 轻记忆 → 影响后续同类提示（无向量、无新后端）。
 */

import type { TaskResult } from "../result/resultTypes";

export const LIGHT_MEMORY_LS_KEY = "aics.lightMemory.v1";
export const LIGHT_MEMORY_MAX_ITEMS = 50;

export type LightMemoryItem = {
  type: "content_experience";
  title: string;
  keywords: string[];
  summary: string;
};

function safeParse(json: string | null): LightMemoryItem[] {
  if (!json?.trim()) return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (!Array.isArray(v)) return [];
    const out: LightMemoryItem[] = [];
    for (const row of v) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      if (o.type !== "content_experience") continue;
      const title = typeof o.title === "string" ? o.title.trim() : "";
      const summary = typeof o.summary === "string" ? o.summary.trim() : "";
      const kwRaw = o.keywords;
      const keywords = Array.isArray(kwRaw)
        ? kwRaw.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim())
        : [];
      if (title || summary) {
        out.push({ type: "content_experience", title: title || summary.slice(0, 40), keywords, summary });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function readLightMemories(): LightMemoryItem[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(LIGHT_MEMORY_LS_KEY));
}

function persist(items: LightMemoryItem[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LIGHT_MEMORY_LS_KEY, JSON.stringify(items));
  } catch {
    /* quota / privacy mode */
  }
}

export function titleKeywordsFromTitle(title: string): string[] {
  const t = title
    .trim()
    .replace(/[「」『』【】《》〈〉]/g, " ");
  if (!t) return [];
  const parts = t.split(/[\s\t\n，。、；：,.;:!?/|]+/).filter((s) => s.trim().length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.trim();
    if (k.length < 2) continue;
    const low = k.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(k);
    if (out.length >= 16) break;
  }
  return out;
}

function scoreMatch(userInputNorm: string, item: LightMemoryItem): number {
  if (!userInputNorm) return 0;
  const title = item.title.trim();
  if (title && userInputNorm.includes(title.toLowerCase())) return 200 + title.length;
  let s = 0;
  for (const kw of item.keywords) {
    const k = kw.trim();
    if (k.length >= 2 && userInputNorm.includes(k.toLowerCase())) s += 15 + k.length;
  }
  return s;
}

/**
 * 命中本地轻记忆时，在发送「结构文章」等大 prompt 前插入经验提示。
 */
export function applyLightMemoryInfluence(
  prompt: string,
  userInput: string
): { prompt: string; hits: string[] } {
  const items = readLightMemories();
  if (items.length === 0) return { prompt, hits: [] };
  const userInputNorm = userInput.trim().toLowerCase();
  const scored = items
    .map((item, idx) => ({ item, idx, score: scoreMatch(userInputNorm, item) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.idx - a.idx);

  const hits: string[] = [];
  const seen = new Set<string>();
  for (const x of scored) {
    const t = x.item.title.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    hits.push(t);
    if (hits.length >= 2) break;
  }
  if (hits.length === 0) return { prompt, hits: [] };

  let prefix =
    "参考你之前写过的内容，请避免重复，并在此基础上提供新的角度或补充更深入的信息。\n\n";
  prefix += `历史相关主题包括：${hits.join("；")}。\n\n`;
  return { prompt: prefix + prompt, hits };
}

/**
 * createTask 成功后：满足条件则写入轻记忆（FIFO 50）。
 */
export function extractLightMemory(result: TaskResult): void {
  if (result.kind !== "content") return;
  const taskType = result.metadata && (result.metadata as { taskType?: unknown }).taskType;
  if (taskType !== "content") return;

  const title = (result.title ?? "").trim();
  const body = (result.body ?? "").trim();
  const lenNorm = `${title}\n${body}`.replace(/\s/g, "").length;
  if (lenNorm <= 300) return;

  const displayTitle = title || body.split(/\n/)[0]?.trim() || "";
  if (!displayTitle) return;

  const item: LightMemoryItem = {
    type: "content_experience",
    title: displayTitle.slice(0, 200),
    keywords: titleKeywordsFromTitle(displayTitle),
    summary: (body || title).replace(/\s+/g, " ").trim().slice(0, 120)
  };

  let next = readLightMemories().filter((x) => x.title !== item.title);
  next.push(item);
  while (next.length > LIGHT_MEMORY_MAX_ITEMS) next.shift();
  persist(next);
}
