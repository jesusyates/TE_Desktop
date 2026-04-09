/**
 * Phase 1：下一篇建议 — 从历史成功条目的词频抽关键块（可解释、无黑盒模型）。
 */

import { normalizeForSim } from "../textSimilarity";

function pickKeywordLine(prompt: string): string | null {
  const m = normalizeForSim(prompt).match(/主题\s*[:：]\s*([^\n,，;；]{2,40})/);
  if (m?.[1]) return m[1].trim();
  const m2 = normalizeForSim(prompt).match(/关于\s*([^\n,，;；]{2,24})/);
  if (m2?.[1]) return m2[1].trim();
  return null;
}

export function suggestNextTopicsFromHistory(
  currentPrompt: string,
  historyPrompts: string[],
  limit = 3
): string[] {
  const cur = normalizeForSim(currentPrompt);
  const keywords = new Map<string, number>();
  for (const p of historyPrompts) {
    const line = pickKeywordLine(p);
    const k = line || normalizeForSim(p).slice(0, 24);
    if (k.length < 4) continue;
    if (cur.includes(k) || k.includes(cur.slice(0, 12))) continue;
    keywords.set(k, (keywords.get(k) ?? 0) + 1);
  }
  return [...keywords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => `围绕「${k}」写下一篇：补充案例与可执行清单`);
}
