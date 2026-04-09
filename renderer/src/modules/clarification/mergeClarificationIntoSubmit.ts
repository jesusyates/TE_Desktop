import type { ClarificationQuestion } from "../../services/api";
import type { StartTaskPayload } from "../../types/task";
import type { TaskMode } from "../../types/taskMode";

/**
 * 将一次确认的选项并入 prompt，并在任务方向为 content / computer 时锁定 `requestedMode`。
 */
export function mergeClarificationIntoSubmit(
  basePrompt: string,
  questions: ClarificationQuestion[],
  answers: Record<string, string>,
  basePayload: StartTaskPayload
): StartTaskPayload {
  const parts: string[] = [];
  let modeOverride: TaskMode | undefined;
  for (const q of questions) {
    const raw = (answers[q.key] ?? q.defaultValue ?? q.options[0]?.value ?? "").trim();
    const opt = q.options.find((o) => o.value === raw);
    if (opt) parts.push(`${q.label}：${opt.label}`);
    if (q.key === "task_direction" && (raw === "content" || raw === "computer")) {
      modeOverride = raw;
    }
  }
  const suffix = parts.length ? `\n\n（已确认）${parts.join("；")}` : "";
  const mergedPrompt = `${basePrompt.trim()}${suffix}`;
  return {
    ...basePayload,
    prompt: mergedPrompt,
    ...(modeOverride ? { requestedMode: modeOverride } : {})
  };
}
