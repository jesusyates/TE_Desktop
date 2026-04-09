import type { ComputerExecutionEvent } from "../../../types/computerExecution";
import type { ComputerTaskResult } from "../../result/resultTypes";

/**
 * 将单次 capability 运行期间产生的事件归一为正式 TaskResult（kind=computer）。
 * 调用方应对每次 capability.run 使用独立事件累加器，避免多步能力事件混叠。
 */
export function toComputerTaskResult(events: ComputerExecutionEvent[]): ComputerTaskResult | null {
  if (!events.length) return null;

  const complete = events.find(
    (e): e is Extract<ComputerExecutionEvent, { type: "execution.complete" }> => e.type === "execution.complete"
  );
  const env = events.find(
    (e): e is Extract<ComputerExecutionEvent, { type: "environment.detected" }> => e.type === "environment.detected"
  );
  const launches = events.filter(
    (e): e is Extract<ComputerExecutionEvent, { type: "app.launch" }> => e.type === "app.launch"
  );
  const stepCompletes = events.filter((e) => e.type === "step.complete").length;
  const lastLaunch = launches.length ? launches[launches.length - 1]! : undefined;

  const environmentLabel =
    env?.environment === "desktop"
      ? "Desktop"
      : env?.environment === "browser"
        ? "Browser"
        : undefined;

  const targetApp = lastLaunch?.appName;
  const summary = complete?.summary?.trim() ?? "";
  const title =
    targetApp && targetApp !== "File System"
      ? `Computer Execution · ${targetApp}`
      : targetApp === "File System"
        ? "Computer Execution · File System"
        : "Computer Execution Result";

  const bodyParts = [
    summary || null,
    environmentLabel ? `Environment: ${environmentLabel}.` : null,
    targetApp ? `Target app: ${targetApp}.` : null,
    stepCompletes > 0 ? `Completed ${stepCompletes} execution step(s).` : null,
    `Total ${events.length} event(s) in this run.`
  ].filter((x): x is string => Boolean(x));

  const body = bodyParts.join("\n\n") || summary || "Computer capability finished.";

  return {
    kind: "computer",
    title,
    summary: summary || undefined,
    body,
    environmentLabel,
    targetApp,
    stepCount: stepCompletes > 0 ? stepCompletes : undefined,
    eventCount: events.length,
    metadata: {
      _source: "computer_events" as const,
      hasExecutionComplete: Boolean(complete)
    }
  };
}
