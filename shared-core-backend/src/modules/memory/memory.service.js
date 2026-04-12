/**
 * AICS Memory 资产：高价值可复用沉淀（非 history）。
 * GET /v1/memory：聚合 asset行（aics:asset:*）与 domain entries（POST /v1/memory/entries），统一为 normalizeMemoryRecord 形态。
 */
const { randomUUID } = require("crypto");
const { getMemoryAssetStore, getMemoryDomainStore } = require("../../stores/registry");
const { logger } = require("../../infra/logger");
const { normalizeMemoryRecord } = require("../../schemas/memory.schema");

/** 与 memory.store SupabaseMemoryAssetStore 一致；domain 列表含同表行时须排除，避免与 asset 重复 */
const ASSET_ENTRY_PREFIX = "aics:asset:";

/**
 * 移除可疑本地路径、过长字段；不存全量 result。
 * @param {unknown} obj
 */
function sanitizeResultSnapshot(obj) {
  const maxDepth = 5;
  function walk(x, depth) {
    if (depth > maxDepth) return "[truncated]";
    if (x == null) return x;
    if (typeof x === "string") {
      if (
        /^[a-zA-Z]:\\/.test(x) ||
        x.startsWith("\\\\") ||
        /^\/home\//i.test(x) ||
        /^\/Users\//i.test(x) ||
        /^file:\/\//i.test(x)
      ) {
        return "[redacted_path]";
      }
      return x.length > 8000 ? x.slice(0, 8000) : x;
    }
    if (Array.isArray(x)) return x.slice(0, 40).map((i) => walk(i, depth + 1));
    if (typeof x === "object") {
      const o = {};
      for (const [k, v] of Object.entries(x)) {
        if (/path|filepath|file_path|localPath|local_uri/i.test(k)) {
          o[k] = "[redacted]";
          continue;
        }
        o[k] = walk(v, depth + 1);
      }
      return o;
    }
    return x;
  }
  return walk(obj, 0);
}

/**
 * @param {unknown} entryKey
 * @returns {boolean}
 */
function isAssetEntryKey(entryKey) {
  const k = entryKey != null ? String(entryKey) : "";
  return k.startsWith(ASSET_ENTRY_PREFIX);
}

/**
 * @param {unknown} value
 * @param {unknown} entryKey
 * @returns {string}
 */
function deriveDomainEntrySummary(value, entryKey) {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (typeof v.prompt === "string" && v.prompt.trim()) {
    return String(v.prompt).trim().slice(0, 2000);
  }
  const payload = v.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (typeof payload.summaryLine === "string" && payload.summaryLine.trim()) {
      return String(payload.summaryLine).trim().slice(0, 2000);
    }
    try {
      const s = JSON.stringify(payload);
      return s.length > 2000 ? s.slice(0, 2000) : s;
    } catch {
      /* fallthrough */
    }
  }
  if (typeof v.raw === "string" && v.raw.trim()) {
    return String(v.raw).trim().slice(0, 2000);
  }
  const k = entryKey != null ? String(entryKey) : "";
  if (k && k !== "__prefs__") return k.slice(0, 2000);
  return "";
}

/**
 * Domain `listEntries` 行 → 与 asset 列表相同的 API 项（memoryId 前缀 dom_ 以免与 asset id 碰撞）
 * @param {{ id?: unknown, key?: unknown, value?: unknown, createdAt?: unknown, created_at?: unknown }} entryRow
 */
function domainEntryRowToApiRecord(entryRow) {
  if (!entryRow || typeof entryRow !== "object") return null;
  const id = entryRow.id;
  if (id == null || String(id).trim() === "") return null;
  const key = entryRow.key != null ? String(entryRow.key) : "";
  if (key === "__prefs__" || isAssetEntryKey(key)) return null;

  const value = entryRow.value;
  const v = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const memoryType =
    typeof v.memoryType === "string" && v.memoryType.trim() ? String(v.memoryType).trim() : "note";
  const summary = deriveDomainEntrySummary(value, key);
  const createdAt =
    entryRow.createdAt != null
      ? String(entryRow.createdAt)
      : entryRow.created_at != null
        ? String(entryRow.created_at)
        : "";

  return normalizeMemoryRecord({
    memoryId: `dom_${String(id)}`,
    type: memoryType,
    summary,
    createdAt,
    market: typeof v.market === "string" ? v.market : undefined,
    locale: typeof v.locale === "string" ? v.locale : undefined,
    product: typeof v.product === "string" ? v.product : undefined
  });
}

/**
 * @param {import('express').Request['context']} ctx
 */
async function listMemoryItems(ctx) {
  const requestId = ctx && ctx.requestId ? ctx.requestId : null;
  const assetStore = getMemoryAssetStore();
  const domainStore = getMemoryDomainStore();

  let assetRows = [];
  try {
    assetRows = await assetStore.listByUser(ctx, requestId);
  } catch (e) {
    logger.warn({
      event: "memory_asset_list_failed",
      userId: ctx && ctx.userId != null ? String(ctx.userId) : null,
      error: e instanceof Error ? e.message : String(e)
    });
  }

  let domainEntries = [];
  try {
    domainEntries = await domainStore.listEntries(ctx, 500);
  } catch (e) {
    logger.warn({
      event: "memory_domain_list_failed",
      userId: ctx && ctx.userId != null ? String(ctx.userId) : null,
      error: e instanceof Error ? e.message : String(e)
    });
  }

  const fromAsset = (assetRows || []).map((r) => normalizeMemoryRecord(r)).filter(Boolean);
  const fromDomain = (domainEntries || []).map(domainEntryRowToApiRecord).filter(Boolean);

  const merged = [...fromAsset, ...fromDomain];
  merged.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return merged;
}

/**
 * 成功执行后写入 successful pattern（不影响主链）。
 * @param {import('express').Request['context']} ctx
 * @param {object} opts
 * @param {string} opts.runId
 * @param {string} opts.prompt
 * @param {string} opts.summary
 * @param {object} opts.finalResult
 */
async function writeSuccessfulPatternMemory(ctx, opts) {
  const runId = String(opts.runId || "").trim();
  const prompt = String(opts.prompt || "").slice(0, 8000);
  const summary = String(opts.summary || "").slice(0, 2000);
  const snap = sanitizeResultSnapshot({
    resultSourceType: opts.finalResult && opts.finalResult.resultSourceType,
    summary: opts.finalResult && opts.finalResult.summary,
    stepsCompleted: opts.finalResult && opts.finalResult.stepsCompleted,
    planGoal: opts.finalResult && opts.finalResult.plan && opts.finalResult.plan.goal
  });

  const memoryId = `mem_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const store = getMemoryAssetStore();
    const row = await store.create(
      ctx,
      {
        memoryId,
        type: "pattern",
        summary: summary || prompt.slice(0, 240),
        prompt: prompt.slice(0, 2000),
        resultSnapshot: snap,
        createdAt
      },
      ctx.requestId || null
    );
    logger.info({
      event: "memory_written",
      userId: ctx && ctx.userId != null ? String(ctx.userId) : null,
      runId,
      success: true,
      durationMs: Date.now() - t0,
      memoryId: row && row.memoryId
    });
    return row;
  } catch (e) {
    logger.warn({
      event: "memory_written",
      userId: ctx && ctx.userId != null ? String(ctx.userId) : null,
      runId,
      success: false,
      durationMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e)
    });
    return null;
  }
}

module.exports = {
  listMemoryItems,
  writeSuccessfulPatternMemory,
  sanitizeResultSnapshot
};
