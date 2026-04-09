/**
 * D-4-1：任务模板（可复用任务骨架），非「收藏夹」。
 * 必须保留来源任务 identity，便于追溯与后续「从模板新建」。
 */

export type TemplateVariableType = "text" | "textarea" | "number" | "select";

/** D-4-4：模板参数定义（仅用于 sourcePrompt 实例化） */
export type TemplateVariable = {
  id: string;
  key: string;
  label: string;
  type: TemplateVariableType;
  required?: boolean;
  defaultValue?: string;
  options?: string[];
  placeholder?: string;
};

/** D-4-4：填写参数后的实例化输入 */
export type TemplateRunInput = {
  templateId: string;
  values: Record<string, string>;
};

/** 最终结果摘要（可序列化；不绑定后端 result 原始形态） */
export type TemplateResultSnapshot = {
  title: string;
  bodyPreview: string;
  stepCount: number;
  durationLabel?: string | null;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  /** E-4：与 Core 模板正式字段对齐（列表/详情展示与保存） */
  product?: string;
  market?: string;
  locale?: string;
  version?: string;
  audience?: string;
  /** D-7-4C：可选业务标签（列表展示） */
  platform?: string;
  /** D-7-4C：与 TaskMode / 工作流 hint 对齐的字符串 */
  workflowType?: string;
  /** 来源任务 id（业务上「此模板从哪次执行沉淀」） */
  sourceTaskId: string;
  /** D-7-4N：来源会话/归档 run（可选，如 run-3） */
  sourceRunId?: string;
  /** D-7-4N：保存模板时结果类型快照 */
  sourceResultKind?: "content" | "computer" | "none";
  /** 用户原始 prompt（只读引用；编辑模板不改此字段） */
  sourcePrompt: string;
  createdAt: string;
  lastUsedAt: string;
  /** 执行步骤原始快照（与 event stream 条目形态一致，仅拷贝不改造） */
  stepsSnapshot: unknown[];
  resultSnapshot: TemplateResultSnapshot;
  /** D-4-3：单分类 */
  category?: string;
  /** D-4-3：标签 */
  tags?: string[];
  /** D-4-4：可配置参数（无则沿用整段 sourcePrompt 注入） */
  variables?: TemplateVariable[];
  /** 预留：附件结构声明 */
  attachmentSchema?: unknown;
  /** 预留：可变输入字段声明 */
  inputSchema?: unknown;
};

/** updateTemplate 允许的部分字段（禁止改 sourceTaskId / sourcePrompt / 快照引用） */
export type TemplateUpdatePatch = {
  name?: string;
  description?: string;
  category?: string | null;
  tags?: string[];
  lastUsedAt?: string;
  variables?: TemplateVariable[] | null;
};

/** 保存入口入参；与未来 POST /templates 请求体对齐 */
export type SaveTemplateFromTaskInput = {
  name: string;
  description?: string;
  /** 默认由保存链路写入 Core；缺省为 aics + 当前会话 market/locale */
  product?: string;
  market?: string;
  locale?: string;
  workflowType?: string;
  version?: string;
  audience?: string;
  platform?: string;
  sourceTaskId: string;
  /** D-7-4N */
  sourceRunId?: string;
  /** D-7-4N */
  sourceResultKind?: "content" | "computer" | "none";
  sourcePrompt: string;
  stepsSnapshot: unknown[];
  resultSnapshot: TemplateResultSnapshot;
  category?: string;
  tags?: string[];
  attachmentSchema?: unknown;
  inputSchema?: unknown;
};
