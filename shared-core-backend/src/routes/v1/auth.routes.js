const express = require("express");

const { asyncRoute } = require("../async-route");

const { sendV1FromLegacyHandler, sendV1Success, sendV1Failure } = require("../../utils/v1-http");

const { readBearerFromReq } = require("../../../auth/session.middleware");

const { isAuthProviderSupabase } = require("../../../auth/auth-provider.util");

const legacy = require("../../../auth/auth.handlers");

const supabase = require("../../../auth/supabase.handlers");

function pickAuth() {
  const handlers = isAuthProviderSupabase() ? supabase : legacy;
  if (isAuthProviderSupabase() && handlers === legacy) {
    throw new Error("LEGACY_AUTH_DISABLED_IN_SUPABASE_MODE");
  }
  return handlers;
}



const router = express.Router();



router.post(

  "/login",

  asyncRoute(async (req, res) => {

    const h = pickAuth();

    const r = await Promise.resolve(h.handleAuthLogin(req, req.body || {}));

    return sendV1FromLegacyHandler(res, req, r.status, r.body);

  })

);



router.post(

  "/register",

  asyncRoute(async (req, res) => {

    const h = pickAuth();

    const r = await Promise.resolve(h.handleAuthRegister(req, req.body || {}));

    return sendV1FromLegacyHandler(res, req, r.status, r.body);

  })

);



router.post(

  "/verify-email",

  asyncRoute(async (req, res) => {

    const h = pickAuth();

    const r = await Promise.resolve(h.handleAuthVerifyEmail(req, req.body || {}));

    return sendV1FromLegacyHandler(res, req, r.status, r.body);

  })

);



router.post(

  "/resend-verification",

  asyncRoute(async (req, res) => {

    const h = pickAuth();

    const r = await Promise.resolve(h.handleAuthResendVerification(req, req.body || {}));

    return sendV1FromLegacyHandler(res, req, r.status, r.body);

  })

);



router.post(

  "/forgot-password",

  asyncRoute(async (req, res) => {

    const h = pickAuth();

    const r = await Promise.resolve(h.handleAuthForgotPassword(req, req.body || {}));

    return sendV1FromLegacyHandler(res, req, r.status, r.body);

  })

);



router.post(

  "/reset-password",

  asyncRoute(async (req, res) => {

    const h = pickAuth();

    const r = await Promise.resolve(h.handleAuthResetPassword(req, req.body || {}));

    return sendV1FromLegacyHandler(res, req, r.status, r.body);

  })

);



router.post(

  "/refresh",

  asyncRoute(async (req, res) => {

    const h = pickAuth();

    const r = await Promise.resolve(h.handleAuthRefresh(req, req.body || {}));

    return sendV1FromLegacyHandler(res, req, r.status, r.body);

  })

);



router.get(

  "/me",

  (req, res, next) => {
    res.setHeader("Deprecation", "true");
    res.setHeader(
      "Link",
      '</v1/account/session>; rel="successor-version", </v1/account/entitlements>; rel="related"'
    );
    next();
  },

  asyncRoute(async (req, res) => {

    const h = pickAuth();

    const r = await Promise.resolve(h.handleAuthMe(req, readBearerFromReq(req)));

    return sendV1FromLegacyHandler(res, req, r.status, r.body);

  })

);



router.post(

  "/logout",

  asyncRoute(async (req, res) => {

    const h = pickAuth();

    const r = await Promise.resolve(h.handleAuthLogout(req, req.body || {}));

    return sendV1FromLegacyHandler(res, req, r.status, r.body);

  })

);



router.get(
  "/mfa/status",
  asyncRoute(async (req, res) => {
    return sendV1Success(
      res,
      req,
      { supported: false, enrolled: false, factors: [] },
      200,
      null
    );
  })
);

router.post(
  "/mfa/enroll",
  asyncRoute(async (req, res) => {
    return sendV1Failure(
      res,
      req,
      501,
      "NOT_IMPLEMENTED",
      "MFA 将在后续版本开放；紧急恢复请联系人工支持。"
    );
  })
);

module.exports = router;


