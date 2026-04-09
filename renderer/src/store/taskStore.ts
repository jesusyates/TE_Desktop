import { create } from "zustand";
import { ResultPackage, TaskInput, TaskRecord } from "../types/task";

type TaskState = {
  currentInput: TaskInput;
  latestResult?: ResultPackage;
  history: TaskRecord[];
  setInput: (input: TaskInput) => void;
  setResult: (result: ResultPackage) => void;
  reuseTask: (id: string) => void;
};

const emptyInput: TaskInput = { oneLinePrompt: "", importedMaterials: [] };

const createMockResult = (prompt: string): ResultPackage => ({
  title: `围绕「${prompt}」的内容方案`,
  hook: "开场 3 秒抓住注意力",
  contentStructure: "痛点 -> 观点 -> 方案 -> CTA",
  body: "这是正文占位，后续由 Shared Core 生成结果替换。",
  copywriting: "复制到平台并按场景微调。",
  tags: ["内容创作", "AICS", "工作流"],
  publishSuggestion: "建议 20:00-22:00 发布，优先短视频平台。"
});

export const useTaskStore = create<TaskState>((set, get) => ({
  currentInput: emptyInput,
  latestResult: undefined,
  history: [],
  setInput: (input) => set({ currentInput: input }),
  setResult: (result) =>
    set((state) => {
      const record: TaskRecord = {
        id: crypto.randomUUID(),
        input: state.currentInput,
        output: result,
        createdAt: new Date().toISOString()
      };
      return { latestResult: result, history: [record, ...state.history] };
    }),
  reuseTask: (id) => {
    const task = get().history.find((x) => x.id === id);
    if (!task) return;
    set({ currentInput: task.input, latestResult: createMockResult(task.input.oneLinePrompt) });
  }
}));

export const runLocalDemoGeneration = (input: TaskInput, setResult: (r: ResultPackage) => void) => {
  setResult(createMockResult(input.oneLinePrompt || "未命名主题"));
};
