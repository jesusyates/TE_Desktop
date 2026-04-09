import type {
  ComputerExecutionEvent,
  ComputerExecutionStepState,
  ComputerExecutionStepView,
  ComputerExecutionView
} from "../../../types/computerExecution";

type StepInternal = {
  title: string;
  state: ComputerExecutionStepState;
  progress?: number;
  errorMessage?: string;
};

const DEFAULT_VIEW = (): ComputerExecutionView => ({
  environmentLabel: "—",
  targetApp: "—",
  currentStatus: "Waiting",
  currentStatusDetail: "",
  timelinePhaseLabel: "—",
  steps: [],
  currentStepId: null,
  logs: [],
  screenshots: []
});

function envToLabel(environment: "desktop" | "browser"): string {
  return environment === "browser" ? "Browser" : "Desktop";
}

/**
 * 按时间顺序折叠事件流为 UI 视图（无 I/O，纯函数）。
 */
export function reduceComputerEvents(events: ComputerExecutionEvent[]): ComputerExecutionView {
  if (events.length === 0) {
    return DEFAULT_VIEW();
  }

  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const view = DEFAULT_VIEW();
  const stepMap = new Map<string, StepInternal>();
  const stepOrder: string[] = [];

  const ensureStep = (stepId: string, title: string) => {
    if (!stepMap.has(stepId)) {
      stepMap.set(stepId, { title, state: "pending", progress: 0 });
      stepOrder.push(stepId);
    }
  };

  for (const e of sorted) {
    switch (e.type) {
      case "environment.detected":
        view.environmentLabel = envToLabel(e.environment);
        view.timelinePhaseLabel = "阶段 · 环境已识别";
        view.currentStatus = "Preparing environment";
        view.currentStatusDetail = e.os ? `OS: ${e.os}` : "";
        break;
      case "app.launch":
        view.targetApp = e.appName;
        view.timelinePhaseLabel = "阶段 · 应用启动中";
        view.currentStatus = "Preparing environment";
        if (e.windowTitle) view.currentStatusDetail = e.windowTitle;
        break;
      case "app.ready":
        view.timelinePhaseLabel = "阶段 · 应用就绪";
        view.currentStatus = "Ready to operate";
        if (e.appName) view.targetApp = e.appName;
        break;
      case "step.start":
        ensureStep(e.stepId, e.title);
        const st = stepMap.get(e.stepId)!;
        st.title = e.title;
        st.state = "running";
        st.progress = st.progress ?? 0;
        view.currentStepId = e.stepId;
        view.currentStatus = "Operating";
        view.timelinePhaseLabel = "阶段 · 执行中";
        break;
      case "step.progress": {
        const sp = stepMap.get(e.stepId);
        if (sp) {
          sp.progress = Math.max(0, Math.min(1, e.progress));
          sp.state = "running";
        }
        break;
      }
      case "step.complete": {
        const sc = stepMap.get(e.stepId);
        if (sc) {
          sc.state = "success";
          sc.progress = 1;
        }
        if (view.currentStepId === e.stepId) view.currentStepId = null;
        break;
      }
      case "step.error": {
        const se = stepMap.get(e.stepId);
        if (se) {
          se.state = "failed";
          se.errorMessage = e.message;
        }
        if (view.currentStepId === e.stepId) view.currentStepId = null;
        view.currentStatus = "Failed";
        view.currentStatusDetail = e.message;
        view.timelinePhaseLabel = "阶段 · 步骤失败";
        break;
      }
      case "screenshot":
        view.screenshots.push({
          id: e.id,
          timestamp: e.timestamp,
          imageUrl: e.imageUrl
        });
        break;
      case "log":
        view.logs.push({
          id: e.id,
          timestamp: e.timestamp,
          message: e.message
        });
        break;
      case "execution.complete":
        view.currentStatus = "Completed";
        view.currentStatusDetail = e.summary;
        view.timelinePhaseLabel = "阶段 · 已收尾";
        view.currentStepId = null;
        for (const sid of stepOrder) {
          const row = stepMap.get(sid)!;
          if (row.state === "running") {
            row.state = "success";
            row.progress = 1;
          } else if (row.state === "pending") {
            row.state = "skipped";
          }
        }
        break;
      case "execution.error":
        view.currentStatus = "Failed";
        view.currentStatusDetail = e.message;
        view.timelinePhaseLabel = "阶段 · 异常结束";
        view.currentStepId = null;
        for (const sid of stepOrder) {
          const row = stepMap.get(sid)!;
          if (row.state === "running") row.state = "failed";
          else if (row.state === "pending") row.state = "skipped";
        }
        break;
      default:
        break;
    }
  }

  view.steps = stepOrder.map((id) => {
    const s = stepMap.get(id)!;
    const out: ComputerExecutionStepView = {
      id,
      title: s.title,
      state: s.state,
      progress: s.progress,
      errorMessage: s.errorMessage
    };
    return out;
  });

  return view;
}
