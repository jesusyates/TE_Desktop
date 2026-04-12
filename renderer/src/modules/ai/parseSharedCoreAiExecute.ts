/**
 * Shared Core `POST /v1/ai/execute` 响应 → `ParsedAiContentSuccess`（与旧 `/ai/content` 消费层对齐）。
 */
import type { ResultSource } from "../result/resultTypes";
import type { AiContentWireOutcome, ParseAiContentWireResult } from "./aiContentWireTypes";
import { aiOutcomeFromFailureCode } from "./parseAiContentWire";

function pickString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function fail(
  code: string,
  message: string,
  aiOutcome: AiContentWireOutcome,
  detail?: string
): ParseAiContentWireResult {
  return {
    ok: false,
    value: { code, message, aiOutcome, ...(detail ? { detail } : {}) }
  };
}

/** 将 G-1 的 action + prompt 映射为 execute 唯一字段 `prompt`（不改后端） */
export function mapAiContentActionToExecutePrompt(
  action: "generate" | "summarize",
  prompt: string
): string {
  const p = prompt.trim();
  const tag =
    action === "summarize"
      ? "【AICS·内容步骤·摘要/归纳】\n\n"
      : "【AICS·内容步骤·生成/扩写】\n\n";
  return `${tag}${p}`;
}

/**
 * 解析 v1 信封 `{ success, data?, code?, message? }` 及 `data.resultSourceType` / `data.result`。
 * — `success:false` → 结构化失败（调用方抛错）
 * — `success:true` 且可映射 → 与 `ParsedAiContentSuccess` 同形
 */
export function parseSharedCoreAiExecuteResponse(data: unknown): ParseAiContentWireResult {
  const obj =
    data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!obj) {
    return fail("ai_execute_wire_invalid", "响应不是 JSON 对象", "wire_invalid");
  }

  if (obj.success !== true) {
    const code = pickString(obj.code)?.trim() || "ai_execute_failed";
    const message = pickString(obj.message)?.trim() || "AI 执行失败";
    const aiOutcome = aiOutcomeFromFailureCode(code);
    return {
      ok: false,
      value: {
        code,
        message,
        aiOutcome,
        ...(pickString(obj.detail) ? { detail: pickString(obj.detail) } : {})
      }
    };
  }

  const inner = obj.data;
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) {
    return fail("ai_execute_wire_invalid", "成功响应缺少 data 对象", "wire_invalid");
  }
  const d = inner as Record<string, unknown>;
  const rst = pickString(d.resultSourceType)?.trim();
  if (rst !== "ai_result" && rst !== "mock" && rst !== "fallback") {
    return fail("ai_execute_wire_invalid", "resultSourceType 无效", "wire_invalid");
  }

  const resultRaw = d.result;
  if (!resultRaw || typeof resultRaw !== "object" || Array.isArray(resultRaw)) {
    return fail("ai_execute_wire_invalid", "缺少 result", "wire_invalid");
  }
  const r = resultRaw as Record<string, unknown>;
  const content = pickString(r.content)?.trim() ?? "";
  const summaryPick = pickString(r.summary)?.trim() ?? "";
  const body = content.length > 0 ? content : summaryPick.length > 0 ? summaryPick : "";
  if (!body) {
    return fail("ai_execute_wire_invalid", "result 缺少可用正文", "wire_invalid");
  }

  let resultSource: ResultSource;
  let aiOutcome: AiContentWireOutcome;
  if (rst === "ai_result") {
    resultSource = "ai_result";
    aiOutcome = "router_success";
  } else if (rst === "mock") {
    resultSource = "mock";
    aiOutcome = "local_stub";
  } else {
    resultSource = "fallback";
    aiOutcome = "router_upstream_error";
  }

  const titlePick = pickString(r.title)?.trim();
  const title = titlePick && titlePick.length > 0 ? titlePick : "AI 输出";
  const summary =
    summaryPick.length > 0 ? summaryPick : body.replace(/\s+/g, " ").slice(0, 220);

  return {
    ok: true,
    value: { body, title, summary, resultSource, aiOutcome }
  };
}
