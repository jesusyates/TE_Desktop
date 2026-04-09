import { memoryEngine } from "../memory/memory.engine";

export const saveMemoryAction = async (input: Record<string, unknown>, context: Record<string, unknown>) => {
  const prompt = String(context.prompt ?? "");
  const summary = String(input.summary ?? context.summary ?? "执行完成");
  return memoryEngine.saveFromExecution(prompt, summary);
};
