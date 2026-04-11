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

const AUTH_ERROR_CODES = new Set([
  "EMAIL_NOT_VERIFIED",
  "INVALID_CREDENTIALS",
  "TOKEN_EXPIRED",
  "PASSWORD_RESET_REQUIRED",
  "INVALID_EMAIL_FORMAT",
  "EMAIL_ALREADY_EXISTS",
  "TOO_MANY_REQUESTS",
  "TOO_MANY_ATTEMPTS",
  "RESEND_COOLDOWN",
  "RESEND_VERIFICATION_FAILED",
  "RATE_LIMITED",
  "INVALID_VERIFICATION_TOKEN"
]);

function mapLegacyAuthBodyToError(status, body) {
  const msg = (body && body.message) || "request_failed";
  const explicit =
    body &&
    typeof body === "object" &&
    typeof body.code === "string" &&
    AUTH_ERROR_CODES.has(body.code);
  if (explicit) {
    return { code: body.code, message: String(msg) };
  }
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
    const payload = {
      success: false,
      code: m.code,
      message: m.message,
      requestId: pickRequestId(req)
    };
    try {
      const { config } = require("../infra/config");
      const c = config();
      const expose =
        c.nodeEnv !== "production" ||
        String(process.env.AUTH_EXPOSE_UPSTREAM_IN_RESPONSE || "").trim() === "1";
      if (expose && body && typeof body === "object") {
        if (body.upstreamCode != null) payload.upstreamCode = body.upstreamCode;
        if (body.upstreamMessage != null) payload.upstreamMessage = body.upstreamMessage;
      }
    } catch {
      /* ignore config load failure */
    }
    return res.status(status).json(payload);
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
