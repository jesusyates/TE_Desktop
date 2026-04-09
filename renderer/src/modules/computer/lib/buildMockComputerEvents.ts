import type { ExecutionPhase, ExecutionStatus } from "../../../execution/session/execution";
import type { ComputerExecutionEvent } from "../../../types/computerExecution";

const STEP_SPECS = [
  { id: "c1", title: "解析任务意图与约束" },
  { id: "c2", title: "锁定目标环境" },
  { id: "c3", title: "准备自动化通道" },
  { id: "c4", title: "执行桌面 / 应用操作" },
  { id: "c5", title: "回传执行状态与产物" }
] as const;

function nextId(prefix: string, seq: () => number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${seq()}`;
}

function detectFromPrompt(prompt: string): {
  environment: "desktop" | "browser";
  appName: string;
  windowTitle?: string;
} {
  const p = prompt.toLowerCase();
  if (/浏览器|browser|chrome|edge|firefox|网页|网站/.test(p)) {
    return { environment: "browser", appName: "Web 浏览器", windowTitle: "Browser — 占位" };
  }
  if (/excel|表格|xlsx/.test(p)) {
    return { environment: "desktop", appName: "Microsoft Excel", windowTitle: "Book1 — 占位" };
  }
  if (/word|文档|docx/.test(p)) {
    return { environment: "desktop", appName: "Microsoft Word", windowTitle: "Document1 — 占位" };
  }
  return { environment: "desktop", appName: "通用桌面环境", windowTitle: "Explorer — 占位" };
}

function pushStepPair(
  out: ComputerExecutionEvent[],
  ts: () => string,
  id: (p: string) => string,
  spec: (typeof STEP_SPECS)[number],
  withComplete: boolean
) {
  out.push({
    id: id("ss"),
    type: "step.start",
    timestamp: ts(),
    stepId: spec.id,
    title: spec.title
  });
  if (withComplete) {
    out.push({
      id: id("sc"),
      type: "step.complete",
      timestamp: ts(),
      stepId: spec.id
    });
  }
}

/**
 * D-5-3A：由 session 形态生成占位事件序列（未来由 agent stream 替换）。
 */
export function buildMockComputerEvents(
  prompt: string,
  status: ExecutionStatus,
  phase: ExecutionPhase | null
): ComputerExecutionEvent[] {
  let tick = 0;
  const ts = () => new Date(Date.now() + tick++ * 40).toISOString();
  let n = 0;
  const id = (pfx: string) => nextId(pfx, () => n++);

  if (status === "idle") {
    return [];
  }

  const { environment, appName, windowTitle } = detectFromPrompt(prompt);
  const out: ComputerExecutionEvent[] = [];

  out.push({
    id: id("env"),
    type: "environment.detected",
    timestamp: ts(),
    environment,
    os: "windows"
  });
  out.push({
    id: id("log"),
    type: "log",
    timestamp: ts(),
    message: "Computer capability contract: mock event stream（D-5-3A）"
  });

  const pushLaunchReady = () => {
    out.push({ id: id("al"), type: "app.launch", timestamp: ts(), appName, windowTitle });
    out.push({ id: id("ar"), type: "app.ready", timestamp: ts(), appName });
  };

  switch (status) {
    case "validating":
      break;

    case "queued":
      out.push({ id: id("al"), type: "app.launch", timestamp: ts(), appName, windowTitle });
      break;

    case "running":
    case "paused":
    case "stopping": {
      pushLaunchReady();
      /** 已完成（不含当前步）的步骤数 */
      let done = 0;
      let active = 0;
      let prog = 0.5;
      if (phase === "task_received") {
        done = 0;
        active = 0;
        prog = 0.2;
      } else if (phase === "preparing") {
        done = 2;
        active = 2;
        prog = 0.45;
      } else {
        done = 3;
        active = 3;
        prog = 0.72;
      }
      for (let i = 0; i < done; i++) {
        pushStepPair(out, ts, id, STEP_SPECS[i], true);
      }
      const cur = STEP_SPECS[active];
      out.push({
        id: id("ss"),
        type: "step.start",
        timestamp: ts(),
        stepId: cur.id,
        title: cur.title
      });
      out.push({
        id: id("sp"),
        type: "step.progress",
        timestamp: ts(),
        stepId: cur.id,
        progress: prog
      });
      break;
    }

    case "success": {
      pushLaunchReady();
      for (const spec of STEP_SPECS) {
        pushStepPair(out, ts, id, spec, true);
      }
      out.push({
        id: id("sh"),
        type: "screenshot",
        timestamp: ts(),
        imageUrl: "placeholder://computer-mock/screenshot"
      });
      out.push({
        id: id("xc"),
        type: "execution.complete",
        timestamp: ts(),
        summary: "Mock：电脑侧执行链路已完成（占位）。"
      });
      break;
    }

    case "error":
    case "stopped": {
      pushLaunchReady();
      for (let i = 0; i < 3; i++) {
        pushStepPair(out, ts, id, STEP_SPECS[i], true);
      }
      const fail = STEP_SPECS[3];
      out.push({
        id: id("ss"),
        type: "step.start",
        timestamp: ts(),
        stepId: fail.id,
        title: fail.title
      });
      out.push({
        id: id("se"),
        type: "step.error",
        timestamp: ts(),
        stepId: fail.id,
        message: status === "stopped" ? "执行被用户中止（占位）" : "桌面步骤失败（占位错误）"
      });
      out.push({
        id: id("xe"),
        type: "execution.error",
        timestamp: ts(),
        message: status === "stopped" ? "Execution stopped" : "Execution error (mock)"
      });
      break;
    }

    default:
      break;
  }

  return out;
}
