/**
 * shared-core-backend `/v1/*` 成功体：{ success: true, data: T, meta }；
 * 失败体多为：{ success: false, code, message, requestId }（无外层 data）。
 */

export type V1SuccessEnvelope<T> = { success: true; data: T; meta?: unknown };

export function isV1SuccessEnvelope(raw: unknown): raw is V1SuccessEnvelope<unknown> {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return o.success === true && "data" in o;
}

export function unwrapV1Data<T>(raw: unknown): T {
  if (isV1SuccessEnvelope(raw)) return raw.data as T;
  throw new Error("invalid_v1_success_envelope");
}

/** 2xx 解析：若是 v1 信封则取内层 data，否则原样（兼容意外非信封响应）。 */
export function normalizeV1ResponseBody(raw: unknown): unknown {
  if (isV1SuccessEnvelope(raw)) return raw.data;
  return raw;
}
