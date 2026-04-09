import { ExecutionError } from "../execution/execution.types";

/** 桌面端禁止本地伪生成；真实生成仅允许经 Shared Core POST /api/tasks。 */
export const generateContentAction = async (_input: Record<string, unknown>) => {
  throw new ExecutionError(
    "Client-side generate-content disabled; run tasks via Shared Core POST /api/tasks only.",
    "action_validation_error"
  );
};
