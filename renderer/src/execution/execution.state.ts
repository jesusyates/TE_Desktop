import { create } from "zustand";
import { ExecutionLog, ExecutionTask, PersistenceAlert } from "./execution.types";

type ExecutionState = {
  currentTask?: ExecutionTask;
  currentLogs: ExecutionLog[];
  persistenceAlerts: PersistenceAlert[];
  /** 控制台「暂停」：阻止新一轮提交，直至恢复 */
  operatorPaused: boolean;
  setCurrentTask: (task?: ExecutionTask) => void;
  setCurrentLogs: (logs: ExecutionLog[]) => void;
  setOperatorPaused: (v: boolean) => void;
  addPersistenceAlert: (alert: PersistenceAlert) => void;
  clearPersistenceAlerts: () => void;
};

export const useExecutionState = create<ExecutionState>((set) => ({
  currentTask: undefined,
  currentLogs: [],
  persistenceAlerts: [],
  operatorPaused: false,
  setCurrentTask: (task) => set({ currentTask: task }),
  setCurrentLogs: (logs) => set({ currentLogs: logs }),
  setOperatorPaused: (v) => set({ operatorPaused: v }),
  addPersistenceAlert: (alert) => set((state) => ({ persistenceAlerts: [alert, ...state.persistenceAlerts] })),
  clearPersistenceAlerts: () => set({ persistenceAlerts: [] })
}));
