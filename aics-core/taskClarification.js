/**
 * Task Clarification v1：指令过短且意图未知时，一次选项确认（非聊天、非多轮）。
 */
const { sanitizeMemoryHints } = require("./analyzeTask");

/**
 * @param {object} body
 * @param {object} analysis — `analyzeTaskCore(body)` 的结果
 * @returns {{ questions: Array<{ key: string; label: string; defaultValue: string; options: Array<{ value: string; label: string }> }> } | null}
 */
function resolveClarificationIfNeeded(body, analysis) {
  const rm = body.requestedMode;
  if (rm === "content" || rm === "computer") return null;

  const mem = sanitizeMemoryHints(body.memoryHints);
  if (mem && (mem.preferredMode === "content" || mem.preferredMode === "computer")) {
    return null;
  }

  const atts = Array.isArray(body.attachments) ? body.attachments : [];
  const hasNamedAttachment = atts.some(
    (a) => a && typeof a === "object" && typeof a.name === "string" && a.name.trim().length > 0
  );
  if (hasNamedAttachment) return null;

  if (analysis.intent !== "unknown") return null;
  if (String(analysis.rawPrompt ?? "").trim().length > 12) return null;

  return {
    questions: [
      {
        key: "task_direction",
        label: "指令不够明确，请选择任务方向后继续",
        defaultValue: "content",
        options: [
          { value: "content", label: "内容创作（文案、文章、脚本等）" },
          { value: "computer", label: "本地文件与目录（读取、扫描、整理相关）" },
          { value: "other", label: "其他 / 请按我的原文执行" }
        ]
      }
    ]
  };
}

module.exports = { resolveClarificationIfNeeded };
