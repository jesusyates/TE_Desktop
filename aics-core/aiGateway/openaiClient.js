/**
 * OpenAI Chat Completions（直连 api.openai.com）。
 * @param {{ apiKey: string; model: string; messages: Array<{ role: string; content: string }>; temperature: number; max_tokens: number }} opts
 * @returns {Promise<string>}
 */
async function callOpenAI(opts) {
  const { apiKey, model, messages, temperature, max_tokens } = opts;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens
    })
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI 响应非 JSON（HTTP ${res.status}）：${text.slice(0, 400)}`);
  }

  if (!res.ok) {
    const errMsg =
      typeof data?.error?.message === "string"
        ? data.error.message
        : text.slice(0, 500);
    throw new Error(`OpenAI HTTP ${res.status}: ${errMsg}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (content == null || String(content).trim() === "") {
    throw new Error("OpenAI 返回空内容");
  }

  return String(content);
}

module.exports = { callOpenAI };
