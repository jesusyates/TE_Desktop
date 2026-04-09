/**
 * D-7-3X：拉取 Core 系统策略；失败时使用本地 fallback；首成功后内存缓存。
 */

import { aiGatewayClient } from "./apiClient";

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
let inflight: Promise<SystemPolicy> | null = null;

function normalizeBudget(raw: unknown): ExecutionBudget {
  const fb = LOCAL_FALLBACK_SYSTEM_POLICY.defaultExecutionBudget;
  if (!raw || typeof raw !== "object") return { ...fb };
  const o = raw as Record<string, unknown>;
  const maxSteps = typeof o.maxSteps === "number" && o.maxSteps > 0 ? Math.floor(o.maxSteps) : fb.maxSteps;
  const maxDurationMs =
    typeof o.maxDurationMs === "number" && o.maxDurationMs > 0
      ? Math.floor(o.maxDurationMs)
      : fb.maxDurationMs;
  return { maxSteps, maxDurationMs };
}

function normalizePolicy(raw: unknown): SystemPolicy | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  return {
    automationEnabled: p.automationEnabled !== false,
    highRiskEnabled: p.highRiskEnabled === true,
    defaultExecutionBudget: normalizeBudget(p.defaultExecutionBudget)
  };
}

/**
 * 返回缓存或请求 Core；网络失败返回 fallback 并仍写入缓存以便离线一致。
 */
export async function getSystemPolicy(): Promise<SystemPolicy> {
  if (cachedPolicy) return cachedPolicy;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data: body, status } = await aiGatewayClient.get<unknown>("/system-policy", {
        validateStatus: () => true
      });
      const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      if (status >= 200 && status < 300 && obj.success === true) {
        const policy = normalizePolicy(obj.policy);
        if (policy) {
          cachedPolicy = policy;
          return policy;
        }
      }
    } catch {
      /* use fallback */
    }
    cachedPolicy = {
      ...LOCAL_FALLBACK_SYSTEM_POLICY,
      defaultExecutionBudget: { ...LOCAL_FALLBACK_SYSTEM_POLICY.defaultExecutionBudget }
    };
    return cachedPolicy;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** 在首次异步拉取完成前，用于同步路径的保守默认值 */
export function getSystemPolicySync(): SystemPolicy {
  return (
    cachedPolicy ?? {
      ...LOCAL_FALLBACK_SYSTEM_POLICY,
      defaultExecutionBudget: { ...LOCAL_FALLBACK_SYSTEM_POLICY.defaultExecutionBudget }
    }
  );
}
