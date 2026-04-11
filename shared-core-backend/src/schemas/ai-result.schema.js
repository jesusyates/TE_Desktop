/**
 * Provider 输出 → 统一结构 */

/**
 * @param {object} raw
 * @param {string} [raw.content]
 * @param {string} [raw.provider]
 * @param {string} [raw.model]
 * @param {object} [raw.usage]
 * @param {string} [raw.finishReason]
 */
function normalizeAIResult(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const usageIn = r.usage && typeof r.usage === "object" ? r.usage : {};
  const it = usageIn.inputTokens ?? usageIn.prompt_tokens;
  const ot = usageIn.outputTokens ?? usageIn.completion_tokens;
  const tt = usageIn.totalTokens ?? usageIn.total_tokens;
  return {
    content: r.content != null ? String(r.content) : "",
    provider: r.provider != null ? String(r.provider) : "openai",
    model: r.model != null ? String(r.model) : "",
    usage: {
      inputTokens: it != null ? Number(it) : 0,
      outputTokens: ot != null ? Number(ot) : 0,
      totalTokens: tt != null ? Number(tt) : 0
    },
    finishReason: r.finishReason != null ? String(r.finishReason) : "stop"
  };
}

module.exports = { normalizeAIResult };
