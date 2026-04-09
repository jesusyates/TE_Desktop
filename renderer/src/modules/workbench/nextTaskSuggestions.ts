/**
 * Next Task Suggestion v1：任务完成后规则生成 1–3 条可执行续作建议（无 AI、无新服务）。
 */

import type { TaskResult } from "../result/resultTypes";

function clampTheme(s: string, max: number): string {
  const t = s.trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

/** 从标题或用户输入提取核心主题词 */
export function extractCoreThemeForNextTask(title: string, userInput: string): string {
  const ti = (title || "").trim();
  const m = ti.match(/「([^」]+)」/);
  if (m?.[1]?.trim()) return clampTheme(m[1], 40);

  let u = (userInput || "").trim();
  u = u.replace(/(?:写|做|生成|创作)\s*\d{1,3}\s*(?:篇|个|条)\s*/, "").trim();
  u = u
    .replace(/^(请)?\s*(再)?\s*写\s*一篇\s*(关于)?\s*/g, "")
    .replace(/^写一篇\s*(关于)?\s*/g, "")
    .replace(/^关于\s*/g, "")
    .replace(/的?\s*文章[\s\S]*$/g, "")
    .replace(/文章$/g, "")
    .trim();
  if (u.length >= 2) return clampTheme(u, 40);

  if (ti.length >= 2) {
    const x = ti
      .replace(/^关于/, "")
      .replace(/\s*的分析与思考\s*$/g, "")
      .replace(/[「」]/g, "")
      .trim();
    return clampTheme(x || ti, 40);
  }
  return "该主题";
}

function compact(s: string): string {
  return s.replace(/\s/g, "");
}

/** 与当前用户输入高度相似则跳过该条 */
export function isSuggestionTooSimilarToUserInput(suggestion: string, userInput: string): boolean {
  const u = compact(userInput.trim());
  const v = compact(suggestion.trim());
  if (u.length < 4 || v.length < 4) return false;
  if (u === v) return true;
  if (v.includes(u) || u.includes(v)) return true;
  if (u.length >= 12) {
    const head = u.slice(0, Math.min(24, u.length));
    if (v.includes(head)) return true;
  }
  return false;
}

/**
 * 规则生成下一步任务建议（最多 3 条）。
 */
export function generateNextTaskSuggestions(
  taskResult: TaskResult,
  userInput: string,
  lightMemoryHits?: string[] | null,
  goalChainPrefix?: string | null
): string[] {
  if (taskResult.kind !== "content") return [];
  const taskType = taskResult.metadata && (taskResult.metadata as { taskType?: unknown }).taskType;
  if (taskType !== "content") return [];

  const theme = extractCoreThemeForNextTask(taskResult.title ?? "", userInput);
  const themeSafe = theme || "该主题";
  const prefix = lightMemoryHits?.length ? "基于你之前的内容，进一步" : "";

  const candidates = [
    `${prefix}再写一篇关于「${themeSafe}」的进阶内容`,
    `${prefix}写一篇「${themeSafe}」的实际应用案例`,
    `${prefix}对比不同「${themeSafe}」方案的优缺点`
  ];

  const u = userInput.trim();
  const out: string[] = [];
  for (const s of candidates) {
    if (isSuggestionTooSimilarToUserInput(s, u)) continue;
    out.push(s);
    if (out.length >= 3) break;
  }
  const gpre = typeof goalChainPrefix === "string" && goalChainPrefix.trim() ? goalChainPrefix.trim() : "";
  if (gpre && out.length > 0) {
    out[0] = `${gpre}${out[0]}`;
  }
  return out;
}
