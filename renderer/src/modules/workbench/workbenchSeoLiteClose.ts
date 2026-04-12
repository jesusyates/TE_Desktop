/**
 * SEO-lite 闭环：内置「结构文章」提示壳 + 历史 Jaccard 轻量去重提示（不接新模块能力）。
 */

import { jaccardSimilarity } from "../contentIntelligence/textSimilarity";
import { fetchHistoryListPage } from "../../services/history.api";

/** 用于识别「内置文章包」提示及防重复包裹（与 buildDefaultArticlePrompt 首段一致前缀） */
export const SEO_LITE_ARTICLE_PROMPT_MARKER = "请根据以下主题写一篇结构完整";

const DUPLICATE_HINT_ZH = "注意：该主题与已有内容较为相似，请从新的角度、案例或观点展开，避免重复。\n\n";

const WASTE_PREFIX_RE = /^(以下是|下面是|根据你的要求|这是一篇)[：:、，,\s]*/;

function collapseBlankLines(s: string): string {
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function firstLineLooksBad(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (t.startsWith("##")) return true;
  if (t.length > 40) return true;
  if (/[。！？]/.test(t)) return true;
  return false;
}

/** 从执行 prompt 中解析用户主题（文章包内「主题：…」行）。 */
export function extractArticleThemeFromPrompt(prompt: string): string {
  const m = prompt.match(/主题[：:]\s*([^\n]+)/);
  return (m?.[1] ?? "").trim();
}

/**
 * 轻量格式校验与修正（纯字符串，不二次调用 AI）。
 */
export function normalizeArticleResult(content: string, userTheme: string): string {
  let text = (content ?? "").replace(/\r\n/g, "\n").trim();
  while (WASTE_PREFIX_RE.test(text)) {
    text = text.replace(WASTE_PREFIX_RE, "").trim();
  }
  text = collapseBlankLines(text);

  const theme = (userTheme ?? "").trim() || "该主题";
  const blocks = text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const firstLine = blocks[0]?.split("\n")[0]?.trim() ?? "";
  if (firstLineLooksBad(firstLine)) {
    text = `## ${theme}\n\n${text}`;
    text = collapseBlankLines(text);
  }

  if (!text.includes("##")) {
    const parts = text
      .split(/\n\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const w = [...parts];
      w.splice(1, 0, "## 内容概要");
      if (w.length >= 3) {
        w.splice(w.length - 2, 0, "## 展开说明");
      }
      text = w.join("\n\n");
    } else if (parts.length === 1) {
      text = `${parts[0]}\n\n## 内容概要\n\n## 展开说明`;
    }
  }

  text = collapseBlankLines(text);

  const charCount = text.replace(/\s/g, "").length;
  if (charCount < 300) {
    text = `${text}\n\n总结：该主题仍有进一步探讨空间，可从更多实际案例展开论述。`;
  }

  return text.trim();
}

export function isSeoLiteArticleExecutionPrompt(prompt: string): boolean {
  return typeof prompt === "string" && prompt.includes(SEO_LITE_ARTICLE_PROMPT_MARKER);
}

/** 会话记录用的一句结构锚点（可与 normalize 协同，用于结果侧启发式）。 */
export function buildDefaultArticlePrompt(userTheme: string): string {
  const t = userTheme.trim();
  return (
    `请根据以下主题写一篇结构完整、可阅读性强的文章。\n\n` +
    `主题：${t}\n\n` +
    `写作要求：\n\n` +
    `1. 输出语言：中文\n\n` +
    `2. 标题：给出一个清晰、有吸引力的标题（单独一行）\n\n` +
    `3. 结构：\n\n` +
    `   * 引言（1段，概述主题）\n\n` +
    `   * 正文（3-5个小节，每个小节包含小标题和1-2段内容）\n\n` +
    `   * 结尾（1段总结）\n\n` +
    `4. 小标题使用「## 」前缀（例如：## 背景介绍）\n\n` +
    `5. 每段控制在80-150字，避免过长\n\n` +
    `6. 内容具体，不要空话和套话\n\n` +
    `7. 不要输出任何多余说明（如「以下是…」、「总结如下」等）\n\n` +
    `（内部要求：确保结构完整、无重复段落、无明显语病）`
  );
}

/** 取最近 5 条历史；与当前 prompt（含资料预览）做 Jaccard，>0.6 则前置一句提醒，不阻断。 */
export async function applyHistoryJaccardHint(basePrompt: string): Promise<string> {
  const corpus = basePrompt.trim();
  if (!corpus) return basePrompt;

  try {
    const data = await fetchHistoryListPage(1, 5, null);
    const items = (data.items ?? []).slice(0, 5);
    let max = 0;
    for (const row of items) {
      const blob = `${row.prompt}\n${row.preview ?? ""}`;
      const s = jaccardSimilarity(corpus, blob);
      if (s > max) max = s;
    }
    if (max > 0.6) {
      return DUPLICATE_HINT_ZH + basePrompt;
    }
  } catch {
    /* 未登录 / 网络：静默跳过 */
  }

  return basePrompt;
}
