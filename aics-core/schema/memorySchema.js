/**
 * D-2：Memory 写入归一 — 受控 memoryType、key/value、source / sourceId；禁止无分类写入。
 * 兼容旧载荷：无 memoryType 时视为 successful_task_hint。
 */
const { randomUUID } = require("crypto");
const { normalizeCoreRecordFields } = require("./coreRecordFields");
const { hashMemoryRecordContent } = require("./contentHash");

const MEMORY_TYPES = new Set([
  "style_preference",
  "platform_preference",
  "successful_task_hint",
  "mode_preference",
  "template_preference"
]);

const MEMORY_SOURCES = new Set(["task", "result", "template", "preference"]);

/**
 * @param {unknown} v
 * @returns {string}
 */
function stableValueString(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim().slice(0, 8000);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v).slice(0, 8000);
  } catch {
    return "";
  }
}

/**
 * 旧版 body → successful_task_hint 的 value（禁止塞全文结果）。
 * @param {object} b
 */
function legacySuccessfulHintValue(b) {
  const intent = typeof b.intent === "string" ? b.intent.trim() : "";
  const resolved =
    typeof b.resolvedMode === "string" && b.resolvedMode.trim()
      ? b.resolvedMode.trim()
      : typeof b.requestedMode === "string" && b.requestedMode.trim()
        ? b.requestedMode.trim()
        : "";
  const caps = Array.isArray(b.capabilityIds) ? b.capabilityIds.map(String) : [];
  const resultKind = typeof b.resultKind === "string" ? b.resultKind.trim() : "";
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  return {
    intent: intent.slice(0, 256),
    resolvedMode: resolved.slice(0, 64),
    requestedMode:
      typeof b.requestedMode === "string" ? b.requestedMode.trim().slice(0, 64) : "",
    resultKind: resultKind.slice(0, 32),
    capabilityIds: caps.map((c) => c.slice(0, 128)).slice(0, 64),
    summaryLine: prompt.slice(0, 200)
  };
}

/**
 * @param {{ userId: string; clientId: string; sessionToken?: string }} ctx
 * @param {object} body
 */
function normalizeMemoryPersistPayload(ctx, body) {
  const b = body && typeof body === "object" ? body : {};
  const promptRaw = typeof b.prompt === "string" ? b.prompt.trim() : "";

  const rawMt = typeof b.memoryType === "string" ? b.memoryType.trim() : "";
  if (rawMt && !MEMORY_TYPES.has(rawMt)) {
    throw new Error("invalid_memory_type");
  }
  let memoryType = rawMt && MEMORY_TYPES.has(rawMt) ? rawMt : "";

  let key = typeof b.key === "string" ? b.key.trim().slice(0, 256) : "";
  let valueObj = b.value;
  let source =
    typeof b.source === "string" && MEMORY_SOURCES.has(b.source.trim()) ? b.source.trim() : "";
  let sourceId = typeof b.sourceId === "string" ? b.sourceId.trim().slice(0, 256) : "";

  const isActive = typeof b.isActive === "boolean" ? b.isActive : true;
  const memoryId = typeof b.memoryId === "string" && b.memoryId.trim() ? b.memoryId.trim() : randomUUID();
  const createdAt =
    typeof b.createdAt === "string" && b.createdAt.trim()
      ? b.createdAt.trim()
      : new Date().toISOString();
  const updatedAt =
    typeof b.updatedAt === "string" && b.updatedAt.trim() ? b.updatedAt.trim() : createdAt;

  if (!memoryType) {
    memoryType = "successful_task_hint";
    if (!key) {
      const intent = typeof b.intent === "string" ? b.intent.trim() : "run";
      key = `hint:${intent.slice(0, 120)}`;
    }
    if (valueObj === undefined || valueObj === null) {
      valueObj = legacySuccessfulHintValue(b);
    }
    if (!source) source = "task";
    if (!sourceId && typeof b.planId === "string" && b.planId.trim()) sourceId = b.planId.trim();
  }

  if (!MEMORY_TYPES.has(memoryType)) {
    throw new Error("invalid_memory_type");
  }
  if (!key) {
    throw new Error("memory_key_required");
  }
  const valueStr = stableValueString(valueObj);
  if (!valueStr) {
    throw new Error("memory_value_required");
  }
  if (!source || !MEMORY_SOURCES.has(source)) {
    throw new Error("memory_source_required");
  }

  const mode =
    typeof b.resolvedMode === "string" && b.resolvedMode.trim()
      ? b.resolvedMode.trim()
      : typeof b.requestedMode === "string" && b.requestedMode.trim()
        ? b.requestedMode.trim()
        : "unknown";
  const success = typeof b.success === "boolean" ? b.success : memoryType === "successful_task_hint";

  const prompt =
    promptRaw ||
    `[memory:${memoryType}] ${key}`.slice(0, 400);

  const base = normalizeCoreRecordFields(ctx, {
    prompt,
    createdAt,
    runId: "",
    success,
    mode
  });

  const out = {
    ...b,
    ...base,
    memoryId,
    memoryType,
    key,
    value: valueStr,
    source,
    sourceId: sourceId || null,
    updatedAt,
    isActive,
    requestedMode: b.requestedMode != null ? String(b.requestedMode) : "",
    resolvedMode: b.resolvedMode != null ? String(b.resolvedMode) : "",
    intent: b.intent != null ? String(b.intent) : "",
    planId: b.planId != null && String(b.planId).trim() !== "" ? String(b.planId) : null,
    stepIds: Array.isArray(b.stepIds) ? b.stepIds.map(String) : [],
    capabilityIds: Array.isArray(b.capabilityIds) ? b.capabilityIds.map(String) : [],
    resultKind: b.resultKind != null ? String(b.resultKind) : ""
  };

  out.hash = hashMemoryRecordContent({
    prompt,
    requestedMode: out.requestedMode,
    resolvedMode: out.resolvedMode,
    intent: out.intent,
    resultKind: out.resultKind,
    capabilityIds: out.capabilityIds,
    success: out.success,
    memoryType,
    memoryKey: key
  });

  return out;
}

module.exports = { normalizeMemoryPersistPayload, MEMORY_TYPES, MEMORY_SOURCES };
