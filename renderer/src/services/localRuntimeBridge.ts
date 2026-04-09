import type { ExecutionPlanStep } from "../modules/workbench/execution/executionPlanTypes";
import {
  LR_LABEL_GROUP,
  lrPlanStepAggregateHeader,
  lrSemanticsSuffix,
  lrStepGroupTitle,
  mapLocalRuntimeLogsToUserMessage,
  ruleLabelZh
} from "../modules/workbench/execution/localRuntimeNomenclature.zh";

export async function runLocalExecutionPlanStep(step: ExecutionPlanStep): Promise<{
  ok: boolean;
  title: string;
  body: string;
  summary: string;
  error?: string;
  logs: string[];
}> {
  const api = typeof window !== "undefined" ? window.aicsDesktop?.runLocalStep : undefined;
  if (!api) {
    return {
      ok: false,
      title: LR_LABEL_GROUP,
      body: "",
      summary: "",
      error: "本地执行不可用（客户端未提供本地运行时接口）",
      logs: []
    };
  }
  const raw = await api({ stepType: step.type, input: step.input });
  const logs = Array.isArray(raw.logs) ? raw.logs : [];
  if (!raw.success) {
    return {
      ok: false,
      title: step.title,
      body: import.meta.env.DEV && logs.length ? logs.join("\n") : "",
      summary: "",
      error: mapLocalRuntimeLogsToUserMessage(logs),
      logs
    };
  }
  if (step.type === "local_scan") {
    const body =
      raw.result !== undefined && typeof raw.result === "object"
        ? JSON.stringify(raw.result, null, 2)
        : String(raw.result ?? "");
    const entryCount =
      raw.result && typeof raw.result === "object" && "entryCount" in raw.result
        ? Number((raw.result as { entryCount?: unknown }).entryCount)
        : undefined;
    return {
      ok: true,
      title: lrStepGroupTitle("local_scan"),
      body,
      summary:
        entryCount !== undefined && Number.isFinite(entryCount)
          ? `共 ${entryCount} 项 · ${lrSemanticsSuffix()}`
          : lrSemanticsSuffix(),
      logs
    };
  }
  if (step.type === "local_read") {
    const r = raw.result as {
      text?: string;
      fileName?: string;
      charLength?: number;
      byteLength?: number;
    } | undefined;
    const text = typeof r?.text === "string" ? r.text : "";
    const name = typeof r?.fileName === "string" ? r.fileName : "文件";
    const chars = typeof r?.charLength === "number" ? r.charLength : text.length;
    return {
      ok: true,
      title: `${lrStepGroupTitle("local_read")}：${name}`,
      body: text,
      summary: `${chars} 字符 · ${lrSemanticsSuffix()}`,
      logs
    };
  }
  if (step.type === "local_text_transform") {
    const r = raw.result as { text?: string; rule?: string } | undefined;
    const text = typeof r?.text === "string" ? r.text : "";
    const ruleKey = typeof r?.rule === "string" && r.rule.trim() ? r.rule.trim() : "trim_lines";
    return {
      ok: true,
      title: `${lrStepGroupTitle("local_text_transform")}（${ruleLabelZh(ruleKey)}）`,
      body: text,
      summary: `输出 ${text.length} 字符 · ${lrSemanticsSuffix()}`,
      logs
    };
  }
  if (step.type === "local_file_operation") {
    const r = raw.result as
      | {
          directoryPath?: string;
          safeOp?: string;
          transferMode?: string;
          affectedFiles?: number;
          auditTrail?: string[];
        }
      | undefined;
    const audit = Array.isArray(r?.auditTrail)
      ? r!.auditTrail!.filter((l) => typeof l === "string")
      : [];
    const body =
      audit.length > 0
        ? audit.join("\n")
        : JSON.stringify(raw.result ?? {}, null, 2);
    const n = typeof r?.affectedFiles === "number" ? r!.affectedFiles! : 0;
    const mode =
      r?.transferMode === "copy"
        ? "复制"
        : r?.transferMode === "move"
          ? "移动"
          : "";
    return {
      ok: true,
      title: lrPlanStepAggregateHeader("local_file_operation", step.title, step.title),
      body,
      summary: `已处理 ${n} 项${mode ? ` · ${mode}` : ""} · ${lrSemanticsSuffix()}`,
      logs
    };
  }
  return {
    ok: false,
    title: step.title,
    body: "",
    summary: "",
    error: "unsupported_local_step",
    logs
  };
}
