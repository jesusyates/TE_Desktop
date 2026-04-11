/**
 * Controller v1 输出规范化（规则引擎，非 LLM）。
 */

/** @param {string} s */
function clipGoal(s) {
  const t = String(s || "").trim();
  return t.length > 200 ? t.slice(0, 200) + "…" : t;
}

/**
 * @param {object} raw
 */
function normalizeControllerDecision(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const plan = r.plan && typeof r.plan === "object" ? r.plan : {};
  const steps = Array.isArray(r.steps) ? r.steps : Array.isArray(plan.steps) ? plan.steps : [];
  const ps = r.persistenceStrategy && typeof r.persistenceStrategy === "object" ? r.persistenceStrategy : {};
  return {
    taskType: r.taskType === "research" ? "research" : "content",
    complexity: r.complexity === "medium" ? "medium" : "simple",
    riskLevel:
      r.riskLevel === "L4" ? "L4" : r.riskLevel === "L2" ? "L2" : "L0",
    executionStrategy: r.executionStrategy === "pipeline" ? "pipeline" : "direct",
    persistenceStrategy: {
      shouldWriteMemory: Boolean(ps.shouldWriteMemory),
      shouldSuggestTemplate: Boolean(ps.shouldSuggestTemplate)
    },
    plan: {
      goal: plan.goal != null ? String(plan.goal) : "",
      strategy: plan.strategy === "pipeline" ? "pipeline" : "direct",
      steps: steps.map((s, i) => ({
        id: s.id != null ? String(s.id) : `step_${i + 1}`,
        type: s.type != null ? String(s.type) : "content",
        status: normalizeStepStatus(s.status),
        purpose: s.purpose != null ? String(s.purpose) : ""
      }))
    },
    steps: steps.map((s, i) => ({
      id: s.id != null ? String(s.id) : `step_${i + 1}`,
      type: s.type != null ? String(s.type) : "content",
      status: normalizeStepStatus(s.status),
      purpose: s.purpose != null ? String(s.purpose) : ""
    }))
  };
}

function normalizeStepStatus(s) {
  const v = String(s || "pending").toLowerCase();
  if (v === "running" || v === "success" || v === "error") return v;
  return "pending";
}

module.exports = { normalizeControllerDecision, clipGoal };
