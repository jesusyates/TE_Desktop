import { callApiAction } from "../actions/call-api.action";
import { generateContentAction } from "../actions/generate-content.action";
import { saveMemoryAction } from "../actions/save-memory.action";
import { transformDataAction } from "../actions/transform-data.action";
import { ErrorType, ExecutionActionName, ExecutionError } from "./execution.types";

type ActionHandler = (input: Record<string, unknown>, context: Record<string, unknown>) => Promise<Record<string, unknown>>;

const actionHandlers: Record<ExecutionActionName, ActionHandler> = {
  "generate-content": async (input) => generateContentAction(input),
  "transform-data": async (input, context) => transformDataAction(input, context),
  "call-api": async (input) => callApiAction(input),
  "save-memory": async (input, context) => saveMemoryAction(input, context)
};

const actionWhitelist: ExecutionActionName[] = ["generate-content", "transform-data", "call-api", "save-memory"];

export const executionRunner = {
  async runAction(action: ExecutionActionName, input: Record<string, unknown>, context: Record<string, unknown>) {
    if (!actionWhitelist.includes(action)) {
      throw new ExecutionError(`Action not allowed: ${action}`, "action_validation_error");
    }
    return actionHandlers[action](input, context);
  }
};

export const classifyExecutionError = (error: unknown): ErrorType => {
  if (error instanceof ExecutionError) return error.type;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("network") || message.includes("timeout")) return "network_error";
  if (message.includes("safety") || message.includes("blocked")) return "safety_blocked";
  if (message.includes("validation")) return "action_validation_error";
  return "action_execution_error";
};

export const shouldRetry = (errorType: ErrorType, action: ExecutionActionName) => {
  if (errorType === "network_error") return true;
  if (errorType === "safety_blocked" || errorType === "action_validation_error") return false;
  if (errorType === "action_execution_error") return action === "call-api" || action === "generate-content";
  return false;
};
