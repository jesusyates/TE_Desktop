/**
 * Phase 1：历史相似度 — 纯本地可解释启发式（Jaccard + 字符 n-gram），不接嵌入模型。
 */

const STOP = new Set(
  `
的 了 和 与 或 在 是 我 你 他 她 它 我们 你们 他们 有 没 不 要 会 可以 请 把 将 对 从 到 为 着 过 吗 呢 吧 啊 哪 什么 怎么 如何 一个 一些
the a an is are was were be been being to of and or for with from as at in on by it its this that these those not no yes
`.trim().split(/\s+/)
);

export function normalizeForSim(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u200b\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): Set<string> {
  const n = normalizeForSim(text);
  if (!n) return new Set();
  const raw = n.split(/[^0-9a-z\u4e00-\u9fff]+/i).filter(Boolean);
  const out = new Set<string>();
  for (const w of raw) {
    if (w.length < 2 && !/[0-9]/.test(w)) continue;
    if (STOP.has(w)) continue;
    out.add(w);
  }
  /** 中英混合：二字片段补充中文近重复 */
  for (let i = 0; i < n.length - 1; i++) {
    const slice = n.slice(i, i + 2).trim();
    if (/[\u4e00-\u9fff]{2}/.test(slice)) out.add(slice);
  }
  return out;
}

export function jaccardSimilarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) {
    if (B.has(t)) inter++;
  }
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

export function duplicateRiskFromScore(score: number): "low" | "medium" | "high" {
  if (score >= 0.55) return "high";
  if (score >= 0.32) return "medium";
  return "low";
}
