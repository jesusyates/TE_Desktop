/**
 * AICS Memory 资产：高价值可复用沉淀（非 history）。
 */
const { randomUUID } = require("crypto");
const { getMemoryAssetStore } = require("../../stores/registry");
const { logger } = require("../../infra/logger");
const { normalizeMemoryRecord } = require("../../schemas/memory.schema");

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
 * @param {import('express').Request['context']} ctx
 */
async function listMemoryItems(ctx) {
  const store = getMemoryAssetStore();
  const rows = await store.listByUser(ctx, ctx.requestId || null);
  return (rows || []).map((r) => normalizeMemoryRecord(r)).filter(Boolean);
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
