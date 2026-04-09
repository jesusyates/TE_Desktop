/**
 * Content Intelligence Phase 1 — 服务端权威预检（与桌面 IntelOrchestrationTrace 形状对齐）。
 * 纯启发式 / 无模型；审计由调用方 appendAuditEvent。
 */

const STOP = new Set(
  `
的 了 和 与 或 在 是 我 你 他 她 它 我们 你们 他们 有 没 不 要 会 可以 请 把 将 对 从 到 为 着 过 吗 呢 吧 啊 哪 什么 怎么 如何 一个 一些
the a an is are was were be been being to of and or for with from as at in on by it its this that these those not no yes
`
    .trim()
    .split(/\s+/)
    .filter(Boolean)
);

function normalizeForSim(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\u200b\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text) {
  const n = normalizeForSim(text);
  if (!n) return new Set();
  const raw = n.split(/[^0-9a-z\u4e00-\u9fff]+/i).filter(Boolean);
  const out = new Set();
  for (const w of raw) {
    if (w.length < 2 && !/[0-9]/.test(w)) continue;
    if (STOP.has(w)) continue;
    out.add(w);
  }
  for (let i = 0; i < n.length - 1; i++) {
    const slice = n.slice(i, i + 2).trim();
    if (/[\u4e00-\u9fff]{2}/.test(slice)) out.add(slice);
  }
  return out;
}

function jaccardSimilarity(a, b) {
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

function duplicateRiskFromScore(score) {
  if (score >= 0.55) return "high";
  if (score >= 0.32) return "medium";
  return "low";
}

function pickKeywordLine(prompt) {
  const q = normalizeForSim(prompt);
  const m = q.match(/主题\s*[:：]\s*([^\n,，;；]{2,40})/);
  if (m && m[1]) return m[1].trim();
  const m2 = q.match(/关于\s*([^\n,，;；]{2,24})/);
  if (m2 && m2[1]) return m2[1].trim();
  return null;
}

function suggestNextTopicsFromHistory(currentPrompt, historyPrompts, limit = 3) {
  const cur = normalizeForSim(currentPrompt);
  /** @type {Map<string, number>} */
  const keywords = new Map();
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

function buildSimilarHits(prompt, items, topK = 8) {
  /** @type {any[]} */
  const hits = [];
  const corpus = `${prompt}\n`;
  for (const row of items) {
    const blob = `${row.prompt}\n${row.preview ?? ""}`;
    const score = jaccardSimilarity(corpus, blob);
    if (score < 0.08) continue;
    hits.push({
      historyId: row.historyId,
      score,
      promptExcerpt: row.prompt.length > 120 ? `${row.prompt.slice(0, 120)}…` : row.prompt,
      previewExcerpt: row.preview && String(row.preview).trim()
        ? String(row.preview).length > 80
          ? `${String(row.preview).slice(0, 80)}…`
          : String(row.preview)
        : undefined,
      status: row.status
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}

function strategistAction(maxScore, risk) {
  if (risk === "high") return "update_existing";
  if (risk === "medium") return maxScore >= 0.4 ? "rewrite" : "continue_series";
  return "new_article";
}

function strategistRationale(action, risk, top) {
  if (action === "update_existing") {
    return `与历史条目高度重叠（风险：${risk}）${top ? `，最近似 historyId=${top.historyId}` : ""}；建议在旧文上修订而非另起炉灶。`;
  }
  if (action === "rewrite") return "主题接近但表述空间仍大；建议换角度或结构重写，并显式引用差异点。";
  if (action === "continue_series") return "与历史同属一条内容线；可作为系列续篇，标注前后篇关系。";
  return "与库内摘要重叠低；适合作为新文章起稿（仍建议在发布前做关键词与站内去重检查）。";
}

function isoNow() {
  return new Date().toISOString();
}

/**
 * @param {string} prompt
 * @param {Array<{ historyId: string; prompt: string; preview?: string; status: string }>} historyItems
 */
function runContentIntelPreflightCore(prompt, historyItems) {
  const orchestrationId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ci-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  /** @type {any[]} */
  const steps = [];
  const safetyNotes = [
    "Phase 1 相似度为服务端 Jaccard + 分词启发式（与桌面一致），不构成法务/版权结论；生产判罚须走统一安全与审核策略。"
  ];

  const t0 = isoNow();
  steps.push({
    role: "controller",
    summary: "主控：Content Intelligence 服务端预检（顺序、可审计；无平级并行代理）。",
    payload: {
      phase: "1-pseudo",
      scenario: "seo_content_ops",
      modelPolicy: "structured-steps-only-no-direct-llm",
      source: "aics-core"
    },
    ts: t0
  });

  const items = Array.isArray(historyItems) ? historyItems : [];
  const similar = buildSimilarHits(prompt, items);
  const maxScore = similar[0]?.score ?? 0;
  const risk = duplicateRiskFromScore(maxScore);
  const relatedHistoryIds = similar.filter((s) => s.score >= 0.25).map((s) => s.historyId);

  steps.push({
    role: "librarian",
    summary: `检索 ${items.length} 条历史摘要，命中 ${similar.length} 条候选相似。`,
    payload: {
      topSimilar: similar,
      duplicateRisk: risk,
      maxScore
    },
    ts: isoNow()
  });

  const action = strategistAction(maxScore, risk);
  steps.push({
    role: "strategist",
    summary: `建议动作：${action}`,
    payload: {
      recommendedAction: action,
      rationale: strategistRationale(action, risk, similar[0] ?? null),
      nextTopics: suggestNextTopicsFromHistory(
        prompt,
        items.filter((x) => x.status === "success").map((x) => x.prompt)
      )
    },
    ts: isoNow()
  });

  steps.push({
    role: "writer",
    summary: "正文生成不由此步直连模型；须通过工作台主任务与统一 AI Router / Safety。",
    payload: {
      deferred: true,
      integrateWith: "workbench.session.start"
    },
    ts: isoNow()
  });

  steps.push({
    role: "finalizer",
    summary: "预检结束：可将建议并入输入区后由用户确认再执行。",
    payload: {
      relatedHistoryIds,
      readyForMainTask: true
    },
    ts: isoNow()
  });

  return { orchestrationId, steps, relatedHistoryIds, safetyNotes };
}

module.exports = { runContentIntelPreflightCore, jaccardSimilarity, duplicateRiskFromScore };
