/**
 * AICS Template：可复用工作流（建议不落库）。
 */
const { randomUUID } = require("crypto");
const { getTemplateStore } = require("../../stores/registry");
const { normalizeTemplateRecord } = require("../../schemas/template-record.schema");
const { logger } = require("../../infra/logger");

/**
 * @param {import('express').Request['context']} ctx
 */
async function listTemplatesForApi(ctx) {
  const store = getTemplateStore();
  const rows = await store.list(ctx);
  return (rows || []).map((r) => normalizeTemplateRecord(r)).filter(Boolean);
}

/**
 * @param {object} opts
 * @param {string} opts.runId
 * @param {string} opts.prompt
 * @param {object} opts.decision —已规范化 controller 输出
 * @param {object} opts.finalResult
 */
function buildTemplateSuggestion(opts) {
  const runId = String(opts.runId || "").trim();
  const prompt = String(opts.prompt || "").trim();
  const decision = opts.decision && typeof opts.decision === "object" ? opts.decision : {};
  const plan = decision.plan && typeof decision.plan === "object" ? decision.plan : {};
  const steps = Array.isArray(plan.steps) ? plan.steps : [];

  const templateId = `temp_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const promptStructure = {
    oneLinePrompt: prompt.slice(0, 4000),
    goal: plan.goal != null ? String(plan.goal).slice(0, 2000) : "",
    stepsOutline: steps.map((s) => ({
      id: s.id != null ? String(s.id) : "",
      type: s.type != null ? String(s.type) : "content",
      purpose: s.purpose != null ? String(s.purpose).slice(0, 500) : ""
    })),
    taskType: decision.taskType,
    complexity: decision.complexity
  };
  const description = `可复用内容工作流：${String(plan.goal || prompt).slice(0, 200)}`;

  return {
    templateId,
    promptStructure,
    description,
    createdAt,
    suggested: true
  };
}

/**
 * @param {import('express').Request['context']} ctx
 * @param {object} suggestion
 * @param {string} runId
 * @param {number} [startedAt]
 */
function logTemplateSuggested(ctx, suggestion, runId, startedAt) {
  const t0 = startedAt != null ? startedAt : Date.now();
  logger.info({
    event: "template_suggested",
    userId: ctx && ctx.userId != null ? String(ctx.userId) : null,
    runId: String(runId || "").trim(),
    success: Boolean(suggestion),
    durationMs: Date.now() - t0,
    templateId: suggestion && suggestion.templateId
  });
}

module.exports = {
  listTemplatesForApi,
  buildTemplateSuggestion,
  logTemplateSuggested
};
