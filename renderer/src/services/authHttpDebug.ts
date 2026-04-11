/**
 * Auth HTTP 可观测性：登录/注册等请求的实际 URL、方法、头、响应与失败分类（不含 token 明文）。
 */
import { isAxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

const SENSITIVE_HEADER_KEYS = new Set(
  "authorization cookie set-cookie x-api-key api-key".split(" ").map((s) => s.toLowerCase())
);

export function buildAuthFullUrl(config: InternalAxiosRequestConfig): string {
  const base = String(config.baseURL ?? "").replace(/\/+$/, "");
  const path = String(config.url ?? "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  if (!base) return rel;
  return `${base}${rel}`;
}

export function sanitizeHeadersForLog(h: InternalAxiosRequestConfig["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h || typeof h !== "object") return out;
  const flat = h as Record<string, unknown>;
  for (const key of Object.keys(flat)) {
    const lk = key.toLowerCase();
    if (SENSITIVE_HEADER_KEYS.has(lk)) {
      out[key] = "[redacted]";
      continue;
    }
    const v = flat[key];
    if (v == null) continue;
    if (typeof v === "string") out[key] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[key] = String(v);
    else out[key] = "[complex]";
  }
  return out;
}

function redactTokensDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[max-depth]";
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((x) => redactTokensDeep(x, depth + 1));
  if (typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    const lk = k.toLowerCase();
    if (
      lk === "token" ||
      lk === "access_token" ||
      lk === "refresh_token" ||
      lk === "accesstoken" ||
      lk === "refreshtoken"
    ) {
      next[k] = typeof o[k] === "string" && String(o[k]).length > 8 ? "[redacted]" : "[redacted]";
      continue;
    }
    next[k] = redactTokensDeep(o[k], depth + 1);
  }
  return next;
}

export function previewBodyForLog(data: unknown, maxChars = 2000): string {
  try {
    const redacted = redactTokensDeep(data);
    const s =
      typeof redacted === "string" ? redacted : JSON.stringify(redacted, null, 0) ?? String(redacted);
    const t = String(s);
    return t.length <= maxChars ? t : `${t.slice(0, maxChars)}…(truncated)`;
  } catch {
    return String(data).slice(0, maxChars);
  }
}

/** 登录/注册/验证/重发：联调须可见完整 URL 与响应 */
function isAuthHighSignalPath(fullUrl: string): boolean {
  return /\/v1\/auth\/(login|register|verify-email|resend-verification)/i.test(fullUrl);
}

export function logAuthHttpRequest(config: InternalAxiosRequestConfig): void {
  const fullUrl = buildAuthFullUrl(config);
  const method = String(config.method ?? "GET").toUpperCase();
  if (!isAuthHighSignalPath(fullUrl)) return;
  // eslint-disable-next-line no-console -- 诊断用：须可见实际请求目标
  console.info("[auth-http] request", {
    baseURL: config.baseURL ?? "",
    url: config.url ?? "",
    fullUrl,
    method,
    headers: sanitizeHeadersForLog(config.headers)
  });
}

export function logAuthHttpResponseSuccess(response: AxiosResponse): void {
  const cfg = response.config;
  const fullUrl = buildAuthFullUrl(cfg);
  if (!isAuthHighSignalPath(fullUrl)) return;
  // eslint-disable-next-line no-console -- 诊断用
  console.info("[auth-http] response", {
    fullUrl,
    method: String(cfg.method ?? "GET").toUpperCase(),
    status: response.status,
    bodyPreview: previewBodyForLog(response.data, 1500)
  });
}

export function logAuthHttpResponseError(err: unknown): void {
  if (!isAxiosError(err)) {
    // eslint-disable-next-line no-console -- 诊断用
    console.error("[auth-http] error (non-axios)", { message: err instanceof Error ? err.message : String(err) });
    return;
  }
  const cfg = err.config;
  const fullUrl = cfg ? buildAuthFullUrl(cfg) : "";
  if (fullUrl && !isAuthHighSignalPath(fullUrl)) return;
  const method = cfg ? String(cfg.method ?? "GET").toUpperCase() : "";
  const status = err.response?.status;
  const bodyPreview = err.response?.data != null ? previewBodyForLog(err.response.data, 2000) : "";
  // eslint-disable-next-line no-console -- 诊断用
  console.error("[auth-http] error", {
    baseURL: cfg?.baseURL ?? "",
    url: cfg?.url ?? "",
    fullUrl: fullUrl || "(unknown)",
    method,
    headers: cfg ? sanitizeHeadersForLog(cfg.headers) : {},
    responseStatus: status ?? null,
    responseBodyPreview: bodyPreview || "(empty)",
    axiosCode: err.code ?? null,
    errorMessage: err.message
  });
}

/** 附带 HTTP 响应上下文的业务错误（validateStatus 全放行时 Axios 不抛错，须手动挂载） */
export type AuthHttpContext = {
  status: number;
  requestUrl: string;
  method: string;
  responseBody: unknown;
};

export type ErrorWithAuthHttpContext = Error & { authHttpContext: AuthHttpContext };

export function throwAuthHttpContextError(message: string, ctx: AuthHttpContext): never {
  const err = new Error(message) as ErrorWithAuthHttpContext;
  err.authHttpContext = ctx;
  throw err;
}

export function attachAuthHttpContext(err: Error, ctx: AuthHttpContext): Error {
  (err as ErrorWithAuthHttpContext).authHttpContext = ctx;
  return err;
}

export function getAuthHttpContext(e: unknown): AuthHttpContext | null {
  if (!e || typeof e !== "object" || !(e instanceof Error)) return null;
  const ac = (e as ErrorWithAuthHttpContext).authHttpContext;
  if (!ac || typeof ac !== "object") return null;
  if (typeof (ac as AuthHttpContext).requestUrl !== "string" || typeof (ac as AuthHttpContext).status !== "number") {
    return null;
  }
  return ac as AuthHttpContext;
}

function formatDiagnosticsFromAuthHttpContext(ctx: AuthHttpContext, message: string): string {
  const body = ctx.responseBody != null ? previewBodyForLog(ctx.responseBody, 2500) : "(empty)";
  return [
    `request URL: ${ctx.requestUrl}`,
    `method: ${ctx.method}`,
    `status: ${String(ctx.status)}`,
    `axios code: (业务层错误，非 Axios rejection；请求已由客户端完成)`,
    `response body: ${body}`,
    `原始异常 message: ${message || "(empty)"}`
  ].join("\n");
}

function unwrapDiagnosticSource(e: unknown): unknown {
  if (isAxiosError(e) || getAuthHttpContext(e)) return e;
  if (e instanceof Error && e.cause != null) return unwrapDiagnosticSource(e.cause);
  if (e != null && typeof e === "object" && "originalError" in e) {
    const oe = (e as { originalError?: unknown }).originalError;
    if (oe != null) return unwrapDiagnosticSource(oe);
  }
  return e;
}

/** 供登录/注册 UI 临时展示：区分无响应 / HTTP 错误 / 业务 Error */
export function formatAuthFailureDiagnostics(e: unknown): string {
  const unwrapped = unwrapDiagnosticSource(e);
  if (getAuthHttpContext(unwrapped) && unwrapped instanceof Error) {
    return formatDiagnosticsFromAuthHttpContext(getAuthHttpContext(unwrapped)!, unwrapped.message);
  }
  if (!isAxiosError(unwrapped)) {
    const msg = unwrapped instanceof Error ? unwrapped.message : String(unwrapped);
    return [`原始异常: ${msg || "(empty)"}`, "request URL: (非 Axios，无请求上下文)"].join("\n");
  }
  const ex = unwrapped;
  const cfg = ex.config;
  const fullUrl = cfg ? buildAuthFullUrl(cfg) : "(unknown)";
  const method = cfg ? String(cfg.method ?? "").toUpperCase() : "";
  const status = ex.response?.status;
  const stLabel = status != null ? String(status) : "无 HTTP 响应（多为网络失败、DNS、连接拒绝、超时或 CORS）";
  let body = "";
  if (ex.response?.data != null) {
    body = previewBodyForLog(ex.response.data, 2500);
  } else if (ex.request && !ex.response) {
    body = "(无 response body：请求已发出但未见响应)";
  }
  const hint =
    ex.code === "ERR_NETWORK" || ex.message === "Network Error"
      ? "提示: Network Error 在桌面端常见于目标不可达、TLS 问题、或浏览器侧 CORS（Electron 对部分场景仍受限）。"
      : "";
  return [
    `request URL: ${fullUrl}`,
    `method: ${method || "?"}`,
    `status: ${stLabel}`,
    `axios code: ${ex.code ?? "(none)"}`,
    `response body: ${body || "(empty)"}`,
    `原始异常 message: ${ex.message}`,
    hint
  ]
    .filter(Boolean)
    .join("\n");
}
