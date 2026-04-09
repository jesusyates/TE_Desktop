/**
 * D-5-3A：Computer 模式事件协议（与 ExecutionStatus/Phase 正交，供 agent / 执行器对接）。
 */

export type ComputerEnvironmentDetectedEvent = {
  id: string;
  type: "environment.detected";
  timestamp: string;
  environment: "desktop" | "browser";
  os?: "windows" | "mac";
};

export type ComputerAppLaunchEvent = {
  id: string;
  type: "app.launch";
  timestamp: string;
  appName: string;
  windowTitle?: string;
};

export type ComputerAppReadyEvent = {
  id: string;
  type: "app.ready";
  timestamp: string;
  appName?: string;
};

export type ComputerStepStartEvent = {
  id: string;
  type: "step.start";
  timestamp: string;
  stepId: string;
  title: string;
};

export type ComputerStepProgressEvent = {
  id: string;
  type: "step.progress";
  timestamp: string;
  stepId: string;
  /** 0–1 */
  progress: number;
};

export type ComputerStepCompleteEvent = {
  id: string;
  type: "step.complete";
  timestamp: string;
  stepId: string;
};

export type ComputerStepErrorEvent = {
  id: string;
  type: "step.error";
  timestamp: string;
  stepId: string;
  message: string;
};

export type ComputerScreenshotEvent = {
  id: string;
  type: "screenshot";
  timestamp: string;
  imageUrl: string;
};

export type ComputerLogEvent = {
  id: string;
  type: "log";
  timestamp: string;
  message: string;
};

export type ComputerExecutionCompleteEvent = {
  id: string;
  type: "execution.complete";
  timestamp: string;
  summary: string;
};

export type ComputerExecutionErrorEvent = {
  id: string;
  type: "execution.error";
  timestamp: string;
  message: string;
};

export type ComputerExecutionEvent =
  | ComputerEnvironmentDetectedEvent
  | ComputerAppLaunchEvent
  | ComputerAppReadyEvent
  | ComputerStepStartEvent
  | ComputerStepProgressEvent
  | ComputerStepCompleteEvent
  | ComputerStepErrorEvent
  | ComputerScreenshotEvent
  | ComputerLogEvent
  | ComputerExecutionCompleteEvent
  | ComputerExecutionErrorEvent;

/** UI 步骤状态（由 reducer 从事件推导） */
export type ComputerExecutionStepState = "pending" | "running" | "success" | "failed" | "skipped";

export type ComputerExecutionStepView = {
  id: string;
  title: string;
  state: ComputerExecutionStepState;
  progress?: number;
  errorMessage?: string;
};

export type ComputerExecutionLogView = {
  id: string;
  timestamp: string;
  message: string;
};

export type ComputerExecutionScreenshotView = {
  id: string;
  timestamp: string;
  imageUrl: string;
};

/** Reducer 输出：Computer 壳仅消费此结构 */
export type ComputerExecutionView = {
  environmentLabel: string;
  targetApp: string;
  /** 与 D-5-2 文案对齐的英文主状态 */
  currentStatus: string;
  currentStatusDetail?: string;
  timelinePhaseLabel: string;
  steps: ComputerExecutionStepView[];
  currentStepId: string | null;
  logs: ComputerExecutionLogView[];
  screenshots: ComputerExecutionScreenshotView[];
};
