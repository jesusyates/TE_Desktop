/**
 * G-1A：/ai/content HTTP JSON 唯一解析入口（禁止 api/contentExecutor 各自猜字段）。
 */
import type { ResultSource } from "../result/resultTypes";
import type {
  AiContentWireOutcome,
  ParsedAiContentFailure,
  ParseAiContentWireResult,
  ParsedAiContentSuccess
} from "./aiContentWireTypes";

const SUCCESS_OUTCOMES: ReadonlySet<AiContentWireOutcome> = new Set([
  "router_success",
  "router_fallback_success",
  "local_stub"
]);

/** success:false 响应上不应出现「成功态」aiOutcome */
const SUCCESS_LIKE_FOR_FAILURE_BODY: ReadonlySet<AiContentWireOutcome> = new Set([
  "router_success",
  "router_fallback_success",
  "local_stub"
]);

function pickString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** 将服务端 failure code 映射为统一 aiOutcome（与 aics-core aiRouterContent 对齐） */
export function aiOutcomeFromFailureCode(code: string): AiContentWireOutcome {
  switch (code) {
    case "ai_router_required":
      return "router_not_configured";
    case "ai_router_timeout":
      return "router_timeout";
    case "ai_router_network_error":
      return "router_request_failed";
    case "ai_router_http_error":
      return "router_upstream_error";
    case "ai_router_invalid_json":
      return "router_invalid_response";
    case "ai_router_empty_choice":
      return "router_empty_response";
    case "ai_router_read_error":
      return "router_read_error";
    case "ai_router_all_failed":
      return "router_all_failed";
    case "invalid_action":
    case "prompt_required":
    case "ai_content_prompt_required":
      return "request_invalid";
    default:
      return "wire_invalid";
  }
}

/**
 * 解析网关返回的 JSON（200 + success:true 或 success:false）。
 * — success:false → 结构化失败（由调用方抛错）
 * — success:true → 校验字段；非法则 wire_invalid（调用方抛错，不假装成功）
 */
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

export function parseAiContentGatewayJson(data: unknown): ParseAiContentWireResult {
  const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  if (!obj) {
    return fail("ai_content_wire_invalid", "响应不是 JSON 对象", "wire_invalid");
  }

  if (obj.success !== true) {
    const code = pickString(obj.code)?.trim() || "ai_content_failed";
    const message = pickString(obj.message)?.trim() || "AI 内容请求失败";
    const fromWire = pickString(obj.aiOutcome)?.trim() as AiContentWireOutcome | undefined;
    const aiOutcome =
      fromWire && !SUCCESS_LIKE_FOR_FAILURE_BODY.has(fromWire) ? fromWire : aiOutcomeFromFailureCode(code);
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

  const rawOutcome = pickString(obj.aiOutcome)?.trim() as AiContentWireOutcome | undefined;
  const body = pickString(obj.body)?.trim() ?? "";
  if (!body) {
    return fail("ai_content_wire_invalid", "成功响应缺少非空 body", "wire_invalid");
  }

  const titlePick = pickString(obj.title)?.trim();
  const title = titlePick && titlePick.length > 0 ? titlePick : "AI 输出";

  const summaryPick = pickString(obj.summary)?.trim();
  const summary =
    summaryPick && summaryPick.length > 0 ? summaryPick : body.replace(/\s+/g, " ").slice(0, 220);

  const rsRaw = pickString(obj.resultSource)?.trim();
  let resultSource: ResultSource;
  if (rsRaw === "mock") resultSource = "mock";
  else if (rsRaw === "ai_result") resultSource = "ai_result";
  else {
    return fail("ai_content_wire_invalid", "resultSource 必须为 ai_result 或 mock", "wire_invalid");
  }

  let aiOutcome: AiContentWireOutcome = rawOutcome ?? (resultSource === "mock" ? "local_stub" : "router_success");
  if (!SUCCESS_OUTCOMES.has(aiOutcome)) {
    return fail("ai_content_wire_invalid", "aiOutcome 与成功响应不一致", "wire_invalid");
  }
  if (aiOutcome === "local_stub" && resultSource !== "mock") {
    return fail("ai_content_wire_invalid", "local_stub 必须对应 resultSource mock", "wire_invalid");
  }
  if (
    (aiOutcome === "router_success" || aiOutcome === "router_fallback_success") &&
    resultSource !== "ai_result"
  ) {
    return fail(
      "ai_content_wire_invalid",
      "router_success / router_fallback_success 必须对应 resultSource ai_result",
      "wire_invalid"
    );
  }

  return { ok: true, value: { body, title, summary, resultSource, aiOutcome } };
}

export function parsedFailureToInvokeError(p: ParsedAiContentFailure): Error {
  const d = p.detail ? ` | ${p.detail.slice(0, 200)}` : "";
  return new Error(`${p.code}: ${p.message}${d}`);
}

/** 运输层失败（非 200 或无 JSON）与解析侧统一前缀 */
export function formatAiContentTransportMessage(prefix: string, detail: string): string {
  return `${prefix}: ${detail}`;
}
