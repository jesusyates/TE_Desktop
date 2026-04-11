/**
 * 内存滑动窗口限流（按 userId + 路由类名）。
 */
const { config } = require("../infra/config");
const { pickRequestId } = require("../infra/apiResponse");

/** @type {Map<string, { hits: number[], resetAt: number }>} */
const _buckets = new Map();

function _pruneWindow(hits, windowMs, now) {
  return hits.filter((t) => now - t < windowMs);
}

function _clientKey(req) {
  const ctx = req.context || {};
  const uid = ctx.userId != null && String(ctx.userId).trim() !== "" ? String(ctx.userId).trim() : null;
  if (uid) return `u:${uid}`;
  const cid = req.get ? req.get("x-client-id") : req.headers["x-client-id"];
  if (cid && String(cid).trim()) return `c:${String(cid).trim()}`;
  const ip = (req.ip || req.socket?.remoteAddress || "unknown").toString();
  return `ip:${ip}`;
}

/**
 * @param {object} opts
 * @param {string} opts.name — 逻辑名，与配额无关仅区分计数器
 * @param {number} opts.max — 窗口内最大次数
 * @param {number} [opts.windowMs]
 */
function createUserRouteRateLimit(opts) {
  const name = String(opts.name || "default");
  const max = Math.max(1, Number(opts.max) || 10);
  const windowMs = Math.max(1000, Number(opts.windowMs) || config().rateLimitWindowMs || 60_000);

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const key = `${_clientKey(req)}:${name}`;
    let b = _buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { hits: [], resetAt: now + windowMs };
      _buckets.set(key, b);
    }
    b.hits = _pruneWindow(b.hits, windowMs, now);
    if (b.hits.length >= max) {
      const requestId = pickRequestId(req);
      res.locals.aicsErrorCode = "RATE_LIMITED";
      return res.status(429).json({
        success: false,
        code: "RATE_LIMITED",
        message: "Too many requests",
        requestId
      });
    }
    b.hits.push(now);
    next();
  };
}

/** POST /v1/ai/execute：默认 10 次/分钟 */
const rateLimitAiExecute = createUserRouteRateLimit({
  name: "v1_ai_execute",
  max: Number(process.env.RATE_LIMIT_AI_EXECUTE_PER_MIN) || 10,
  windowMs: 60_000
});

/** POST /v1/tasks/:id/run：默认 20 次/分钟 */
const rateLimitTaskRun = createUserRouteRateLimit({
  name: "v1_task_run",
  max: Number(process.env.RATE_LIMIT_TASK_RUN_PER_MIN) || 20,
  windowMs: 60_000
});

module.exports = {
  createUserRouteRateLimit,
  rateLimitAiExecute,
  rateLimitTaskRun
};
