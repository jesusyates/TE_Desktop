/**
 * D-7-3M：POST /task ingress 落盘收口（JSON 解析仍由 HTTP 层完成）。
 */
const { appendTaskIngress } = require("../taskIngressStore");
const { normalizeTaskIngressForWrite } = require("../schema/taskIngressSchema");

/**
 * @param {{ userId: string; clientId: string; sessionToken?: string }} ctx
 * @param {object} body — 已为普通对象（非 JSON 时上层传 {}）
 */
function recordIngress(ctx, body) {
  const { identity, body: payload } = normalizeTaskIngressForWrite(ctx, body);
  appendTaskIngress(identity, payload);
}

module.exports = { recordIngress };
