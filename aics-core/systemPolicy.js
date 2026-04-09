/**
 * D-7-3X：系统执行策略（内存常量，无 DB / 管理端）。
 */

const DEFAULT_SYSTEM_POLICY = {
  automationEnabled: true,
  highRiskEnabled: false,
  defaultExecutionBudget: {
    maxSteps: 20,
    maxDurationMs: 30000
  }
};

function getSystemPolicy() {
  return { ...DEFAULT_SYSTEM_POLICY, defaultExecutionBudget: { ...DEFAULT_SYSTEM_POLICY.defaultExecutionBudget } };
}

module.exports = {
  DEFAULT_SYSTEM_POLICY,
  getSystemPolicy
};
