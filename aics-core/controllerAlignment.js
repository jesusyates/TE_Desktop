/**
 * Controller v1 ↔ Core analyze/plan 对拍（规则、可审计；不替代 Safety）。
 */

/** @param {unknown} raw */
function sanitizeControllerDecision(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.version !== 1) return null;
  const classification = o.classification;
  const validClass = ["content", "research", "local", "mixed", "automation_reserved"];
  if (typeof classification !== "string" || !validClass.includes(classification)) return null;
  const complexity = o.complexity;
  const validCx = ["simple", "medium", "complex"];
  if (typeof complexity !== "string" || !validCx.includes(complexity)) return null;
  const strategy = o.strategy;
  const validSt = ["direct", "pipeline", "multi_agent_graph"];
  if (typeof strategy !== "string" || !validSt.includes(strategy)) return null;
  const steps = Array.isArray(o.steps) ? o.steps : [];
  const dt =
    o.decisionTrace && typeof o.decisionTrace === "object" && !Array.isArray(o.decisionTrace)
      ? /** @type {Record<string, string>} */ (
          Object.fromEntries(
            Object.entries(o.decisionTrace).map(([k, v]) => [String(k).slice(0, 80), String(v).slice(0, 500)])
          )
        )
      : {};
  return {
    version: 1,
    classification,
    complexity,
    riskLevel: typeof o.riskLevel === "string" ? String(o.riskLevel).slice(0, 8) : "",
    strategy,
    graphReserved: o.graphReserved === true,
    graphBinding:
      typeof o.graphBinding === "string" && o.graphBinding.trim() ? String(o.graphBinding).slice(0, 64) : "",
    stepCount: steps.length,
    decisionTrace: dt,
    explanation: typeof o.explanation === "string" ? o.explanation.slice(0, 2000) : ""
  };
}

/**
 * @param {object} analysis Core analyzeTaskCore 输出
 */
function deriveCoreTaskBucket(analysis) {
  const intent = String(analysis.intent ?? "");
  const mode = String(analysis.resolvedMode ?? "");
  const shouldExecute = Boolean(analysis.shouldExecute);
  if (intent === "organize_files") return { bucket: "local", reason: "organize_files" };
  if (
    intent === "local_directory_scan" ||
    intent === "local_text_file_read" ||
    intent === "local_text_transform"
  ) {
    return { bucket: "local", reason: intent };
  }
  if (mode === "computer" && shouldExecute) return { bucket: "local", reason: "computer_shouldExecute" };
  if (mode === "computer") return { bucket: "local", reason: "computer_mode" };
  return { bucket: "content", reason: `intent=${intent || "unknown"}` };
}

/**
 * @param {ReturnType<typeof sanitizeControllerDecision>} controller
 * @param {object} analysis
 */
function alignAnalyze(controller, analysis) {
  const diffs = [];
  if (!controller) {
    return {
      aligned: true,
      diffs: [],
      coreDerived: deriveCoreTaskBucket(analysis),
      note: "no_controller_decision_in_request"
    };
  }
  const coreDerived = deriveCoreTaskBucket(analysis);
  const c0 = controller.classification;
  if (c0 === "local" && coreDerived.bucket !== "local") {
    diffs.push({
      field: "classification",
      controller: c0,
      coreBucket: coreDerived.bucket,
      coreReason: coreDerived.reason,
      severity: "hard"
    });
  } else if (c0 === "content" && coreDerived.bucket === "local") {
    diffs.push({
      field: "classification",
      controller: c0,
      coreBucket: coreDerived.bucket,
      coreReason: coreDerived.reason,
      severity: "hard"
    });
  } else if ((c0 === "research" || c0 === "mixed") && coreDerived.bucket === "content") {
    diffs.push({
      field: "classification",
      controller: c0,
      coreBucket: coreDerived.bucket,
      coreReason: coreDerived.reason,
      severity: "info",
      note: "core_has_no_research_label; heuristic_only_on_desktop"
    });
  }
  if (c0 === "automation_reserved" && coreDerived.bucket !== "content") {
    diffs.push({
      field: "classification",
      controller: c0,
      coreBucket: coreDerived.bucket,
      severity: "info"
    });
  }
  const hard = diffs.filter((d) => d.severity === "hard");
  return {
    aligned: hard.length === 0,
    diffs,
    coreDerived
  };
}

/**
 * @param {ReturnType<typeof sanitizeControllerDecision>} controller
 * @param {object} plan Core planTaskCore 输出
 */
function alignPlan(controller, plan) {
  const steps = plan && Array.isArray(plan.steps) ? plan.steps : [];
  const coreLen = steps.length;
  if (!controller) {
    return { aligned: true, diffs: [], corePlanStepCount: coreLen, note: "no_controller_decision_in_request" };
  }
  const diffs = [];
  const ctrlSteps = controller.stepCount || 0;
  const strat = controller.strategy;
  const isMinimalCore = coreLen <= 1;
  if (strat === "direct" && ctrlSteps <= 2 && coreLen > 2) {
    diffs.push({
      field: "planShape",
      detail: "controller_direct_vs_core_multi_step",
      controllerStrategy: strat,
      controllerAbstractSteps: ctrlSteps,
      corePlanSteps: coreLen,
      severity: "info"
    });
  }
  if ((strat === "pipeline" || strat === "multi_agent_graph") && isMinimalCore && ctrlSteps > 2) {
    diffs.push({
      field: "planShape",
      detail: "controller_orchestration_view_vs_core_linear_plan",
      controllerStrategy: strat,
      controllerAbstractSteps: ctrlSteps,
      corePlanSteps: coreLen,
      severity: "info"
    });
  }
  const hard = diffs.filter((d) => d.severity === "hard");
  return { aligned: hard.length === 0, diffs, corePlanStepCount: coreLen };
}

module.exports = {
  sanitizeControllerDecision,
  alignAnalyze,
  alignPlan,
  deriveCoreTaskBucket
};
