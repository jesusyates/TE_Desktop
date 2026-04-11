const express = require("express");
const { asyncRoute } = require("../../../routes/async-route");
const { sendV1Success, sendV1Failure } = require("../../../utils/v1-http");
const { requireAuthV1Middleware } = require("../../../middlewares/require-auth.middleware");
const { getAccountSessionService } = require("../services/getAccountSessionService");
const { getAccountEntitlementsService } = require("../services/getAccountEntitlementsService");

const router = express.Router();

function rejectClientUserId(req, res, next) {
  if (req.query && req.query.userId != null) {
    return sendV1Failure(
      res,
      req,
      400,
      "VALIDATION_ERROR",
      "userId must not be supplied by client"
    );
  }
  if (req.body && typeof req.body === "object" && req.body.userId != null) {
    return sendV1Failure(
      res,
      req,
      400,
      "VALIDATION_ERROR",
      "userId must not be supplied by client"
    );
  }
  next();
}

router.get(
  "/session",
  rejectClientUserId,
  requireAuthV1Middleware,
  asyncRoute(async (req, res) => {
    const data = await getAccountSessionService(req.context);
    return sendV1Success(res, req, data, 200, null);
  })
);

router.get(
  "/entitlements",
  rejectClientUserId,
  requireAuthV1Middleware,
  asyncRoute(async (req, res) => {
    const data = await getAccountEntitlementsService(req.context);
    return sendV1Success(res, req, data, 200, null);
  })
);

module.exports = router;
