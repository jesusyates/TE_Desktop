const { callOpenAI } = require("./openaiClient.js");

/**
 * AI Gateway v1：按 Router 决策调用云模型；local_only 不重试、不调 API。
 * 云侧错误全部捕获为可读字符串（不向上抛），以满足「任务执行失败 + 原因」。
 *
 * @param {{ routerDecision?: Record<string, unknown> | null; prompt?: string }} args
 * @returns {Promise<string>}
 */
async function runAiGateway(args) {
  const prompt = args.prompt == null ? "" : String(args.prompt).trim();
  if (!prompt) {
    return "任务执行失败：prompt 为空";
  }

  const rd = args.routerDecision && typeof args.routerDecision === "object" ? args.routerDecision : {};
  const executionMode = rd.executionMode;

  if (executionMode === "local_only") {
    return "[本地模式占位结果] 当前任务未调用云模型。";
  }

  try {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY 未配置");
    }

    const model = String(rd.model || "gpt-4o-mini").trim();
    const params = rd.params && typeof rd.params === "object" ? rd.params : {};
    const temperature =
      typeof params.temperature === "number" && Number.isFinite(params.temperature)
        ? params.temperature
        : 0.7;
    let maxTokens = 2000;
    if (typeof params.maxTokens === "number" && Number.isFinite(params.maxTokens)) {
      maxTokens = params.maxTokens;
    } else if (typeof params.max_tokens === "number" && Number.isFinite(params.max_tokens)) {
      maxTokens = params.max_tokens;
    }

    return await callOpenAI({
      apiKey,
      model,
      messages: [
        { role: "system", content: "You are a helpful AI assistant." },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: maxTokens
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `任务执行失败：${msg}`;
  }
}

module.exports = { runAiGateway };
