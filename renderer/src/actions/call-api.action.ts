import { apiClient } from "../services/apiClient";
import { ExecutionError } from "../execution/execution.types";

export const callApiAction = async (input: Record<string, unknown>) => {
  try {
    const response = await apiClient.post("/desktop/actions/execute", input);
    return { api: response.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "call-api failed";
    throw new ExecutionError(`Shared Core desktop action failed: ${msg}`, "network_error");
  }
};
