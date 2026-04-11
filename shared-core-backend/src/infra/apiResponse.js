/**
 * 系统级路由（非 /v1 业务命名空间）统一响应壳：与 /v1 语义对齐。
 */
function pickRequestId(req) {
  return (req.context && req.context.requestId) || "";
}

function sendSystemSuccess(res, req, data, status = 200) {
  res.status(status).json({
    success: true,
    data: data !== undefined && data !== null ? data : {},
    meta: { requestId: pickRequestId(req) }
  });
}

function sendSystemFailure(res, req, status, code, message) {
  res.status(status).json({
    success: false,
    code,
    message,
    requestId: pickRequestId(req)
  });
}

module.exports = { sendSystemSuccess, sendSystemFailure, pickRequestId };
