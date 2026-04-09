import { memoryStore } from "./memory.store";

export const memoryEngine = {
  saveFromExecution(prompt: string, summary: string) {
    memoryStore.save({
      id: crypto.randomUUID(),
      prompt,
      summary,
      createdAt: new Date().toISOString()
    });
    return { ok: true };
  }
};
