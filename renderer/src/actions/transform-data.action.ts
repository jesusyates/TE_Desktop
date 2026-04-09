import { ExecutionError } from "../execution/execution.types";

/** 桌面端禁止本地伪转换；真实生成仅允许经 Shared Core POST /api/tasks。 */
export const transformDataAction = async (_input: Record<string, unknown>, _context: Record<string, unknown>) => {
  throw new ExecutionError(
    "Client-side transform-data disabled; run tasks via Shared Core POST /api/tasks only.",
    "action_validation_error"
  );
};
