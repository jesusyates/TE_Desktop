/**
 * DeepSeek Chat Completions（OpenAI 兼容接口）— 仅本文件使用网络与密钥组装。
 * @see https://api-docs.deepseek.com/
 */
const { config } = require("../../config");
const { AppError } = require("../../../utils/AppError");

const DEFAULT_BASE = "https://api.deepseek.com";

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {string} opts.model
 * @param {number} opts.timeoutMs
 * @param {string} opts.apiKey
 * @returns {Promise<{ content: string, usage: object, finishReason: string, raw: object }>}
 */
async function chatComplete(opts) {
  const prompt = String(opts.prompt || "");
  const c = config();
  const model = String(opts.model || c.deepseekModelDefault || "deepseek-chat");
  const timeoutMs = Number(opts.timeoutMs) || c.aiTimeoutMs;
  const apiKey = String(opts.apiKey || "");
  const base = String(c.deepseekApiBaseUrl || DEFAULT_BASE).replace(/\/$/, "");

  if (!apiKey) {
    throw new AppError("AI_EXECUTION_FAILED", "AI provider not configured", 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      }),
      signal: controller.signal
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AppError("AI_EXECUTION_FAILED", `deepseek_invalid_json: ${text.slice(0, 200)}`, 502);
    }

    if (!res.ok) {
      const msg = json && json.error && json.error.message ? json.error.message : text.slice(0, 300);
      throw new AppError("AI_EXECUTION_FAILED", msg || `deepseek_http_${res.status}`, 502);
    }

    const choice = json.choices && json.choices[0];
    const content = choice && choice.message && choice.message.content != null ? String(choice.message.content) : "";
    const u = json.usage || {};
    const finishReason = choice && choice.finish_reason != null ? String(choice.finish_reason) : "stop";

    return {
      content,
      usage: {
        prompt_tokens: u.prompt_tokens,
        completion_tokens: u.completion_tokens,
        total_tokens: u.total_tokens
      },
      finishReason,
      raw: json
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e && e.name === "AbortError") {
      throw new AppError("AI_TIMEOUT", "AI request timeout", 504);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatComplete };
