import type { TemplateVariable } from "../types/template";

function newVariableId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 从 prompt 扫描 {{key}}，生成可编辑变量草稿（不覆盖已有 id/key 冲突时仍追加新 key）。
 */
export function extractTemplateVariablesFromPrompt(prompt: string): TemplateVariable[] {
  const keys = new Set<string>();
  const re = /\{\{([a-zA-Z0-9_-]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt)) !== null) {
    keys.add(m[1]);
  }
  return Array.from(keys).map((key) => ({
    id: newVariableId(),
    key,
    label: key,
    type: "text" as const,
    required: false,
    defaultValue: "",
    placeholder: ""
  }));
}

/**
 * 用 values 替换 sourcePrompt 中占位符；缺失的 key 替换为空串。
 */
export function applyTemplateVariables(prompt: string, values: Record<string, string>): string {
  return prompt.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_, key: string) => values[key] ?? "");
}

/** 合并扫描结果：保留已有相同 key 的配置，仅为新 key 追加草稿 */
export function mergeExtractedVariables(
  existing: TemplateVariable[],
  prompt: string
): TemplateVariable[] {
  const have = new Set(existing.map((v) => v.key));
  const extracted = extractTemplateVariablesFromPrompt(prompt);
  const append = extracted.filter((v) => !have.has(v.key));
  return [...existing, ...append];
}
