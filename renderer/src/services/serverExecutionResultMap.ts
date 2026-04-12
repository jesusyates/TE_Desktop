/**
 * Maps shared-core-backend task run / result payloads to unified TaskResult (F-3 来源可解释).
 */
import type { ResultSource, TaskResult } from "../modules/result/resultTypes";
import {
  computeOutputTrustFromDistinctSources,
  provenanceAuthenticityFromDistinctSources
} from "../modules/result/resultSourcePolicy";
import { sanitizeTaskResultForDisplay } from "../modules/result/sanitizeResultContent";

export function normalizeBackendResultSourceType(raw: string): ResultSource {
  const t = String(raw || "").trim().toLowerCase();
  if (t === "ai_result") return "ai_result";
  if (t === "fallback") return "fallback";
  return "mock";
}

export function mapServerExecutionResultToTaskResult(
  prompt: string,
  serverResult: unknown,
  resultSourceType: string,
  templateSuggestion?: unknown
): TaskResult | null {
  if (!serverResult || typeof serverResult !== "object") return null;
  const r = serverResult as Record<string, unknown>;
  const src = normalizeBackendResultSourceType(resultSourceType);

  let title = "";
  let body = "";

  if (src === "ai_result" && r.ai && typeof r.ai === "object") {
    const ai = r.ai as Record<string, unknown>;
    const content = typeof ai.content === "string" ? ai.content : "";
    const summary = typeof r.summary === "string" ? r.summary : "";
    const firstLine =
      summary
        .split("\n")
        .map((x) => x.trim())
        .find(Boolean) || "";
    title = firstLine || "生成结果";
    body = content || summary;
  } else {
    const summary = typeof r.summary === "string" ? r.summary : "";
    title =
      summary
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean) || "执行结果";
    body = summary;
    if (typeof r.disclaimer === "string" && r.disclaimer.trim()) {
      body = `${body}\n\n${r.disclaimer.trim()}`;
    }
  }

  const distinct: ResultSource[] = [src];
  const outputTrust = computeOutputTrustFromDistinctSources(distinct);
  const authenticity = provenanceAuthenticityFromDistinctSources(distinct);

  const meta: Record<string, unknown> = {
    outputTrust,
    coreResultSourceType: resultSourceType,
    resultProvenance: {
      steps: [] as { stepId: string; stepType: string; source: ResultSource }[],
      distinctSources: distinct,
      authenticity
    },
    _source: "shared_core_task_run"
  };
  if (src === "fallback") {
    const code = typeof r.fallbackErrorCode === "string" ? r.fallbackErrorCode.trim() : "";
    const msg = typeof r.fallbackMessage === "string" ? r.fallbackMessage.trim() : "";
    if (code) meta.fallbackErrorCode = code;
    if (msg) meta.fallbackMessage = msg;
  }
  if (src === "mock") {
    const reason = typeof r.mockReason === "string" ? r.mockReason.trim() : "";
    if (reason) meta.mockReason = reason;
  }
  if (prompt.trim()) {
    meta.runPrompt = prompt.trim();
  }
  if (templateSuggestion != null) {
    meta.templateSuggestion = templateSuggestion;
  }

  return sanitizeTaskResultForDisplay({
    kind: "content",
    title: title.slice(0, 500),
    body,
    summary: typeof r.summary === "string" ? r.summary : undefined,
    resultSource: src,
    metadata: meta
  });
}
