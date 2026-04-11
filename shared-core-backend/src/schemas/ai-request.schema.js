/**
 * AI 请求校验（长度等）。
 */
const { config } = require("../infra/config");
const { AppError } = require("../utils/AppError");

/**
 * @param {string} prompt
 * @returns {string} trimmed prompt
 */
function validatePromptForAi(prompt) {
  const p = prompt != null ? String(prompt).trim() : "";
  if (!p) {
    throw new AppError("VALIDATION_ERROR", "prompt is required", 400);
  }
  const max = config().aiMaxPromptChars;
  if (p.length > max) {
    throw new AppError(
      "VALIDATION_ERROR",
      `prompt exceeds AI_MAX_PROMPT_CHARS (${max})`,
      400
    );
  }
  return p;
}

module.exports = { validatePromptForAi };
