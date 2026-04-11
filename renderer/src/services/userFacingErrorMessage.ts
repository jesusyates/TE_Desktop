/**
 * D-7-5L：全局用户可读错误文案统一入口（轻量；非完整 i18n）。
 * 页面层应对外展示的错误优先经此函数，DEV 可另行 console.error 保留原始信息。
 */
import { isAxiosError } from "axios";
import {
  AI_CONTENT_TRANSPORT_USER_ZH,
  AI_CONTENT_WIRE_INVALID_USER_ZH,
  AI_ROUTER_CALL_FAILED_USER_ZH,
  AI_ROUTER_NOT_CONFIGURED_USER_ZH
} from "../modules/result/resultProvenanceUi";

export const USER_FACING_ERROR_FALLBACK =
  "出了点问题，请稍后再试。若持续失败，可检查网络或联系支持。";

/** 与历史 Workbench 路径兼容：合并 stream 与 last 后走同一套归一化 */
export function toUserFacingExecutionError(
  lastErrorMessage: string,
  streamError?: string | null
): string {
  const raw = (streamError?.trim() || lastErrorMessage?.trim() || "").trim();
  return normalizeTechnicalMessage(raw);
}

/**
 * 任意异常值 → 单条用户可读字符串（含 Axios、Error、字符串、含 message 的对象）。
 */
export function toUserFacingErrorMessage(input: unknown): string {
  if (input == null || input === "") return USER_FACING_ERROR_FALLBACK;

  if (isAxiosError(input)) {
    return normalizeAxiosError(input);
  }

  if (typeof input === "string") {
    return normalizeTechnicalMessage(input);
  }

  if (input instanceof Error) {
    return normalizeTechnicalMessage(input.message);
  }

  if (typeof input === "object" && input !== null && "message" in input) {
    const m = (input as { message: unknown }).message;
    if (typeof m === "string") return normalizeTechnicalMessage(m);
  }

  return normalizeTechnicalMessage(String(input));
}

function normalizeAxiosError(e: import("axios").AxiosError): string {
  const status = e.response?.status;
  const data = e.response?.data;
  let bodyMsg = "";
  let detail = "";
  if (data && typeof data === "object" && data !== null) {
    if ("message" in data && data.message != null) {
      bodyMsg = String(data.message).trim();
    }
    if ("detail" in data && data.detail != null) {
      detail = String(data.detail).trim();
    }
  }

  const combined = [bodyMsg, detail].filter(Boolean).join(" ");
  if (combined) {
    return normalizeTechnicalMessage(combined);
  }

  if (status === 401) {
    return normalizeTechnicalMessage("invalid_credentials");
  }
  if (status === 403) {
    return normalizeTechnicalMessage("forbidden");
  }
  if (status === 402) {
    return "当前额度不足或订阅状态异常，请检查账户后再试。";
  }
  if (status === 429) {
    return "请求过于频繁，请稍后再试。";
  }
  if (status === 503 || status === 502 || status === 504) {
    return normalizeTechnicalMessage("ai_router_required");
  }
  if (status != null && status >= 500) {
    return "服务暂时不可用，请稍后再试。";
  }

  if (!e.response || e.code === "ERR_NETWORK" || e.message === "Network Error") {
    return normalizeTechnicalMessage("network_error");
  }
  if (e.code === "ECONNABORTED" || /timeout/i.test(String(e.message || ""))) {
    return normalizeTechnicalMessage("ai_router_timeout");
  }

  if (status != null) {
    return normalizeTechnicalMessage(`http_${status}`);
  }

  return USER_FACING_ERROR_FALLBACK;
}

function normalizeTechnicalMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return USER_FACING_ERROR_FALLBACK;
  const t = trimmed.replace(/\s*\(HTTP\s+\d+\)\s*$/i, "").trim() || trimmed;
  if (!t.trim()) return USER_FACING_ERROR_FALLBACK;

  const lower = t.toLowerCase();

  if (lower.includes("ai_content_transport")) {
    return AI_CONTENT_TRANSPORT_USER_ZH;
  }
  if (lower.includes("ai_content_wire_invalid")) {
    return AI_CONTENT_WIRE_INVALID_USER_ZH;
  }
  if (lower.includes("ai_router_all_failed") || lower.includes("router_all_failed")) {
    return "所有已配置的 AI 模型均调用失败，请稍后重试或检查后端 Router 与密钥。";
  }
  if (
    lower.includes("ai_router_network_error") ||
    lower.includes("ai_router_http_error") ||
    lower.includes("ai_router_empty_choice") ||
    lower.includes("ai_router_invalid_json") ||
    lower.includes("ai_router_read_error") ||
    lower.includes("router_request_failed") ||
    lower.includes("router_upstream_error") ||
    lower.includes("router_empty_response") ||
    lower.includes("router_invalid_response") ||
    lower.includes("router_read_error")
  ) {
    return AI_ROUTER_CALL_FAILED_USER_ZH;
  }
  if (lower.includes("ai_router_required") || /\bai[_\s]?router\b/i.test(t)) {
    return AI_ROUTER_NOT_CONFIGURED_USER_ZH;
  }
  if (
    lower.includes("ai_router_timeout") ||
    lower.includes("router_timeout") ||
    lower.includes("econnaborted") ||
    /\btimeout\b/i.test(t)
  ) {
    return "请求超时，请稍后再试。";
  }
  if (lower.includes("invalid_credentials")) {
    return "邮箱或密码不正确，请检查后重试。";
  }
  if (lower.includes("account_inactive")) {
    return "当前账号暂不可登录，请联系支持或稍后再试。";
  }
  if (lower.includes("forbidden") || lower.includes("http_403") || /\b403\b/.test(t)) {
    return "没有权限执行此操作，请确认已登录且账号状态正常。";
  }
  if (lower.includes("http_429") || /\b429\b/.test(t)) {
    return "请求过于频繁，请稍后再试。";
  }
  if (lower.includes("http_402") || /\b402\b/.test(t) || lower.includes("quota")) {
    return "额度或订阅异常，请检查账户后再试。";
  }
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network error") ||
    lower === "network_error" ||
    lower.includes("err_network")
  ) {
    return "无法连接到服务，请检查网络后重试。";
  }
  if (lower.includes("http_500") || /\b500\b/.test(lower)) {
    return "服务出现异常，请稍后再试。";
  }
  if (lower.includes("http_502") || lower.includes("http_504")) {
    return "网关响应异常，请稍后再试。";
  }

  // 业务常量码（大写蛇形）：不向用户展示原文
  if (/^[A-Z][A-Z0-9_]*$/.test(t) && t.length <= 80) {
    return USER_FACING_ERROR_FALLBACK;
  }

  // 纯蛇形/常量码短串：不向用户展示实现细节
  if (/^[a-z][a-z0-9_]+$/.test(t) && t.length <= 64 && !/\s/.test(t)) {
    return USER_FACING_ERROR_FALLBACK;
  }

  return t;
}
