/**
 * 将路由层未包装异常统一为 AppError（供 asyncRoute / 边界使用）。
 */
const { AppError } = require("./AppError");

/**
 * @param {unknown} err
 * @returns {AppError}
 */
function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err && typeof err === "object") {
    const code = err.code != null ? String(err.code) : "";
    const msg = err.message != null ? String(err.message) : "unexpected_error";
    if (code === "AI_TIMEOUT") {
      return new AppError("AI_TIMEOUT", msg || "AI request timeout", 504);
    }
    if (code === "AI_PROVIDER_NOT_CONFIGURED") {
      return new AppError("AI_EXECUTION_FAILED", "AI provider not configured", 503);
    }
    if (code === "AI_EXECUTION_FAILED") {
      return new AppError("AI_EXECUTION_FAILED", msg.slice(0, 500), 502);
    }
  }
  const message =
    err instanceof Error      ? err.message
      : err != null && typeof err !== "object"
        ? String(err)
        : "unexpected_error";
  return new AppError("INTERNAL_ERROR", message.slice(0, 500) || "unexpected_error", 500);
}

module.exports = { toAppError };
