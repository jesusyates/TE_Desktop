function baseMeta(req, pagination = null) {
  return {
    requestId: (req.context && req.context.requestId) || "",
    pagination
  };
}

function sendV1Success(res, req, data, status = 200, pagination = null) {
  res.status(status).json({
    success: true,
    data: data !== undefined && data !== null ? data : {},
    meta: baseMeta(req, pagination)
  });
}

function pickRequestId(req) {
  return (req.context && req.context.requestId) || "";
}

function sendV1Failure(res, req, status, code, message) {
  res.status(status).json({
    success: false,
    code,
    message,
    requestId: pickRequestId(req)
  });
}

function mapLegacyAuthBodyToError(status, body) {
  const msg = (body && body.message) || "request_failed";
  if (status === 401) return { code: "UNAUTHORIZED", message: String(msg) };
  if (status === 403) return { code: "FORBIDDEN", message: String(msg) };
  if (status === 404) return { code: "NOT_FOUND", message: String(msg) };
  if (status === 429) return { code: "RATE_LIMITED", message: String(msg) };
  if (status >= 400 && status < 500) return { code: "CLIENT_ERROR", message: String(msg) };
  return { code: "UPSTREAM_ERROR", message: String(msg) };
}

function sendV1FromLegacyHandler(res, req, status, body) {
  if (status >= 400) {
    const m = mapLegacyAuthBodyToError(status, body);
    return sendV1Failure(res, req, status, m.code, m.message);
  }
  return sendV1Success(res, req, body, status, null);
}

module.exports = {
  sendV1Success,
  sendV1Failure,
  sendV1FromLegacyHandler,
  pickRequestId,
  baseMeta
};
