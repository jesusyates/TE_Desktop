const express = require("express");
const { asyncRoute } = require("../async-route");
const { sendV1Success } = require("../../utils/v1-http");
const { rateLimitAiExecute } = require("../../middlewares/rateLimit.middleware");
const aiExecuteService = require("../../modules/ai/aiExecute.service");
const aiService = require("../../services/v1/ai.service");

const router = express.Router();

router.post(
  "/router/preview",
  asyncRoute(async (req, res) => {
    const data = await aiExecuteService.routerPreview(req.context, req.body || {});
    return sendV1Success(res, req, data, 200, null);
  })
);

router.post(
  "/execute",
  rateLimitAiExecute,
  asyncRoute(async (req, res) => {
    const data = await aiExecuteService.standaloneExecute(req.context, req.body || {});
    return sendV1Success(res, req, data, 200, null);
  })
);

/** 兼容旧 POST /v1/ai */
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const data = await aiService.routerPlaceholder(req.context);
    return sendV1Success(res, req, data, 200, null);
  })
);

module.exports = router;
