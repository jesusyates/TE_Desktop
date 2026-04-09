/**
 * D-7-3E + D-7-3V：与桌面安全规则对齐；返回分级协议（success/decision/level/reason/codes + issues）。
 */
const { FORBIDDEN_KEYWORDS, HIGH_RISK_KEYWORDS } = require("./safetyRules");
const { enrichRiskControl } = require("./riskTierMeta");

function normalizePrompt(prompt) {
  return String(prompt ?? "")
    .trim()
    .toLowerCase();
}

function collectForbiddenIssues(text) {
  const issues = [];
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      issues.push({
        code: "forbidden_keyword",
        message: `描述中包含可能被禁止的内容：“${kw}”。为保障安全与合规，任务已拦截。`,
        level: "high"
      });
    }
  }
  return issues;
}

function collectHighRiskIssues(text) {
  const issues = [];
  for (const kw of HIGH_RISK_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      issues.push({
        code: "high_risk_keyword",
        message: `检测到可能的高风险操作相关表述：“${kw}”。请确认后继续。`,
        level: "medium"
      });
    }
  }
  return issues;
}

function tierFromIssues(decision, level, issues) {
  const codes = issues.map((i) => i.code).filter(Boolean);
  const reason =
    issues.length > 0 ? issues.map((i) => i.message).join(" ") : "";
  return {
    success: true,
    decision,
    level,
    reason,
    codes,
    issues,
    ...enrichRiskControl(decision, level)
  };
}

/**
 * @param {{ prompt: string, plan?: unknown, analysis?: unknown }} body
 */
function runSafetyCheckCore(body) {
  void body.plan;
  void body.analysis;
  const text = normalizePrompt(body.prompt);

  const forbidden = collectForbiddenIssues(text);
  if (forbidden.length) {
    return tierFromIssues("block", "high", forbidden);
  }

  const highRisk = collectHighRiskIssues(text);
  if (highRisk.length) {
    return tierFromIssues("confirm", "medium", highRisk);
  }

  return tierFromIssues("allow", "low", []);
}

module.exports = { runSafetyCheckCore };
