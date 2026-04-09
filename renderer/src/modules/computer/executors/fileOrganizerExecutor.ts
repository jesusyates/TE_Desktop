import { getAicsDesktop } from "../../../services/desktopBridge";
import type { ComputerExecutionEvent } from "../../../types/computerExecution";

export type FileOrganizerInput = {
  targetPath: "Desktop" | "Downloads";
  strategy: "byType";
};

function errEv(message: string): ComputerExecutionEvent {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `err-${Date.now()}`;
  return {
    id,
    type: "execution.error",
    timestamp: new Date().toISOString(),
    message
  };
}

/**
 * 调用主进程 fs 整理；事件通过 emitEvent 实时回流（不走 UI）。
 */
export async function runFileOrganizerTask(
  input: FileOrganizerInput,
  emitEvent: (event: ComputerExecutionEvent) => void
): Promise<void> {
  const desktop = getAicsDesktop();

  if (!desktop?.runFileOrganize || !desktop.onFileOrganizeEvent) {
    emitEvent(errEv("当前环境未暴露文件整理 IPC（请在 Electron 客户端内运行）。"));
    return;
  }
  const off = desktop.onFileOrganizeEvent((raw) => {
    emitEvent(raw as ComputerExecutionEvent);
  });
  try {
    await desktop.runFileOrganize(input);
  } finally {
    off();
  }
}
