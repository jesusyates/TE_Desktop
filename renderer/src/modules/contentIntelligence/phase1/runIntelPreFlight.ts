/**
 * Phase 1 预检编排：Controller → Librarian（相似度）→ Strategist（动作建议）→ Writer（占位）→ Finalizer。
 * 不调用 LLM；结果可完整回放。
 */

import type { HistoryListItemDto } from "../../../services/history.api";
import type {
  ContentActionKind,
  DuplicateRiskLevel,
  IntelOrchestrationTrace,
  SimilarHistoryHit,
  StructuredAgentOutput
} from "../types";
import { duplicateRiskFromScore, jaccardSimilarity } from "../textSimilarity";
import { suggestNextTopicsFromHistory } from "./keywordTopics";

function isoNow() {
  return new Date().toISOString();
}

function buildSimilarHits(prompt: string, items: HistoryListItemDto[], topK = 8): SimilarHistoryHit[] {
  const hits: SimilarHistoryHit[] = [];
  const corpus = `${prompt}\n`;
  for (const row of items) {
    const blob = `${row.prompt}\n${row.preview ?? ""}`;
    const score = jaccardSimilarity(corpus, blob);
    if (score < 0.08) continue;
    hits.push({
      historyId: row.historyId,
      score,
      promptExcerpt: row.prompt.length > 120 ? `${row.prompt.slice(0, 120)}…` : row.prompt,
      previewExcerpt: row.preview?.trim()
        ? row.preview.length > 80
          ? `${row.preview.slice(0, 80)}…`
          : row.preview
        : undefined,
      status: row.status
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, topK);
}

function strategistAction(maxScore: number, risk: DuplicateRiskLevel): ContentActionKind {
  if (risk === "high") return "update_existing";
  if (risk === "medium") return maxScore >= 0.4 ? "rewrite" : "continue_series";
  return "new_article";
}

function strategistRationale(action: ContentActionKind, risk: DuplicateRiskLevel, top: SimilarHistoryHit | null): string {
  if (action === "update_existing") {
    return `与历史条目高度重叠（风险：${risk}）${
      top ? `，最近似 historyId=${top.historyId}` : ""
    }；建议在旧文上修订而非另起炉灶。`;
  }
  if (action === "rewrite") return "主题接近但表述空间仍大；建议换角度或结构重写，并显式引用差异点。";
  if (action === "continue_series") return "与历史同属一条内容线；可作为系列续篇，标注前后篇关系。";
  return "与库内摘要重叠低；适合作为新文章起稿（仍建议在发布前做关键词与站内去重检查）。";
}

export function runIntelPreFlight(prompt: string, historyItems: HistoryListItemDto[]): IntelOrchestrationTrace {
  const orchestrationId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ci-${Date.now()}`;
  const steps: StructuredAgentOutput[] = [];
  const safetyNotes: string[] = [
    "Phase 1 相似度为本地 Jaccard + 分词启发式，不构成法务/版权结论；生产判罚须走统一安全与审核策略。"
  ];

  const t0 = isoNow();
  steps.push({
    role: "controller",
    summary: "主控：Phase 1 单进程顺序预检（无平级并行代理）。",
    payload: {
      phase: "1-pseudo",
      scenario: "seo_content_ops",
      modelPolicy: "structured-steps-only-no-direct-llm-here"
    },
    ts: t0
  });

  const similar = buildSimilarHits(prompt, historyItems);
  const maxScore = similar[0]?.score ?? 0;
  const risk = duplicateRiskFromScore(maxScore);
  const relatedHistoryIds = similar.filter((s) => s.score >= 0.25).map((s) => s.historyId);

  steps.push({
    role: "librarian",
    summary: `检索 ${historyItems.length} 条历史摘要，命中 ${similar.length} 条候选相似。`,
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
        historyItems.filter((x) => x.status === "success").map((x) => x.prompt)
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

export function runIntelPostCritic(
  trace: IntelOrchestrationTrace,
  draftTitle: string,
  draftBodyPreview: string,
  historyItems: HistoryListItemDto[]
): IntelOrchestrationTrace {
  const blob = `${draftTitle}\n${draftBodyPreview}`;
  let max = 0;
  let nearest: SimilarHistoryHit | null = null;
  for (const row of historyItems) {
    const score = jaccardSimilarity(blob, `${row.prompt}\n${row.preview ?? ""}`);
    if (score > max) {
      max = score;
      nearest = {
        historyId: row.historyId,
        score,
        promptExcerpt: row.prompt.slice(0, 120),
        previewExcerpt: row.preview?.slice(0, 80),
        status: row.status
      };
    }
  }
  const risk = duplicateRiskFromScore(max);
  const step: StructuredAgentOutput = {
    role: "critic",
    summary:
      risk === "high"
        ? "生成结果与历史条目在字面上仍高度接近，建议修订后再发布。"
        : risk === "medium"
          ? "与库内条目存在一定重叠，建议补充差异化段落或更新旧文。"
          : "与近期历史摘要重叠度低（启发式）。",
    payload: {
      duplicateRisk: risk,
      maxScore: max,
      nearestHistory: nearest
    },
    ts: new Date().toISOString()
  };
  return {
    ...trace,
    steps: [...trace.steps, step]
  };
}
