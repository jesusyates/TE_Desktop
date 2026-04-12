/**
 * G-1A：内容生成成功态的统一消费形（`parseSharedCoreAiExecuteResponse` 产出；旧 `/ai/content` 已弃用）。
 */

import type { ResultSource } from "../result/resultTypes";

/** 服务端与客户端对齐的 AI 内容路径结局（用于 metadata.aiOutcome 与 UI） */
export type AiContentWireOutcome =
  | "router_success"
  | "router_fallback_success"
  | "router_all_failed"
  | "local_stub"
  | "router_not_configured"
  | "router_timeout"
  | "router_request_failed"
  | "router_upstream_error"
  | "router_invalid_response"
  | "router_empty_response"
  | "router_read_error"
  | "wire_invalid"
  | "transport_error"
  | "request_invalid";

export type ParsedAiContentSuccess = {
  body: string;
  title: string;
  summary: string;
  resultSource: ResultSource;
  aiOutcome: AiContentWireOutcome;
};

export type ParsedAiContentFailure = {
  code: string;
  message: string;
  aiOutcome: AiContentWireOutcome;
  detail?: string;
};

export type ParseAiContentWireResult =
  | { ok: true; value: ParsedAiContentSuccess }
  | { ok: false; value: ParsedAiContentFailure };
