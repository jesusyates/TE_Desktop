/**
 * D-7-3X / P3：执行策略 — 本地默认（`LOCAL_FALLBACK_SYSTEM_POLICY`）；不再请求旧网关 `/system-policy`。
 * 与 Shared Core `/v1/settings` 字段不对齐，P3 不强行映射；后续可由正式策略 API 替换。
 */

export type ExecutionBudget = {
  maxSteps: number;
  maxDurationMs: number;
};

export type SystemPolicy = {
  automationEnabled: boolean;
  highRiskEnabled: boolean;
  defaultExecutionBudget: ExecutionBudget;
};

export const LOCAL_FALLBACK_SYSTEM_POLICY: SystemPolicy = {
  automationEnabled: true,
  highRiskEnabled: false,
  defaultExecutionBudget: {
    maxSteps: 20,
    maxDurationMs: 30000
  }
};

let cachedPolicy: SystemPolicy | null = null;

function snapshotFallback(): SystemPolicy {
  return {
    ...LOCAL_FALLBACK_SYSTEM_POLICY,
    defaultExecutionBudget: { ...LOCAL_FALLBACK_SYSTEM_POLICY.defaultExecutionBudget }
  };
}

/**
 * 返回本地策略快照（首次调用后缓存）；不阻塞于外网。
 */
export async function getSystemPolicy(): Promise<SystemPolicy> {
  if (cachedPolicy) return cachedPolicy;
  cachedPolicy = snapshotFallback();
  return cachedPolicy;
}

/** 在首次异步拉取完成前，用于同步路径的保守默认值 */
export function getSystemPolicySync(): SystemPolicy {
  return cachedPolicy ?? snapshotFallback();
}
