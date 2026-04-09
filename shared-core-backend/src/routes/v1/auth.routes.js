const express = require("express");
const { asyncRoute } = require("../async-route");
const { sendV1FromLegacyHandler } = require("../../utils/v1-http");
const { readBearerFromReq } = require("../../../auth/session.middleware");
const {
  handleAuthLogin,
  handleAuthRegister,
  handleAuthVerifyEmail,
  handleAuthResendVerification,
  handleAuthForgotPassword,
  handleAuthResetPassword,
  handleAuthRefresh,
  handleAuthMe,
  handleAuthLogout
} = require("../../../auth/auth.handlers");

const router = express.Router();

router.post(
  "/login",
  asyncRoute(async (req, res) => {
    const r = handleAuthLogin(req, req.body || {});
    return sendV1FromLegacyHandler(res, req, r.status, r.body);
  })
);

router.post(
  "/register",
  asyncRoute(async (req, res) => {
    const r = await handleAuthRegister(req, req.body || {});
    return sendV1FromLegacyHandler(res, req, r.status, r.body);
  })
);

router.post(
  "/verify-email",
  asyncRoute(async (req, res) => {
    const r = handleAuthVerifyEmail(req, req.body || {});
    return sendV1FromLegacyHandler(res, req, r.status, r.body);
  })
);

router.post(
  "/resend-verification",
  asyncRoute(async (req, res) => {
    const r = await handleAuthResendVerification(req, req.body || {});
    return sendV1FromLegacyHandler(res, req, r.status, r.body);
  })
);

router.post(
  "/forgot-password",
  asyncRoute(async (req, res) => {
    const r = await handleAuthForgotPassword(req, req.body || {});
    return sendV1FromLegacyHandler(res, req, r.status, r.body);
  })
);

router.post(
  "/reset-password",
  asyncRoute(async (req, res) => {
    const r = handleAuthResetPassword(req, req.body || {});
    return sendV1FromLegacyHandler(res, req, r.status, r.body);
  })
);

router.post(
  "/refresh",
  asyncRoute(async (req, res) => {
    const r = handleAuthRefresh(req, req.body || {});
    return sendV1FromLegacyHandler(res, req, r.status, r.body);
  })
);

router.get(
  "/me",
  asyncRoute(async (req, res) => {
    const r = handleAuthMe(req, readBearerFromReq(req));
    return sendV1FromLegacyHandler(res, req, r.status, r.body);
  })
);

router.post(
  "/logout",
  asyncRoute(async (req, res) => {
    const r = handleAuthLogout(req, req.body || {});
    return sendV1FromLegacyHandler(res, req, r.status, r.body);
  })
);

module.exports = router;
