const express = require("express");
const { config } = require("../infra/config");
const { checkReady } = require("../infra/db/ready-check");

const router = express.Router();

router.get("/health", (_req, res) => {
  const c = config();
  res.json({
    status: "ok",
    service: c.serviceName,
    env: c.nodeEnv
  });
});

router.get("/ready", async (req, res) => {
  const requestId = (req.context && req.context.requestId) || "";
  const r = await checkReady();
  if (!r.ok) {
    return res.status(503).json({
      success: false,
      ready: false,
      code: "DEPENDENCY_UNAVAILABLE",
      message: r.error || "Dependency not ready",
      core: r.core,
      supabase: r.supabase,
      requestId
    });
  }
  res.json({
    ready: true,
    service: config().serviceName,
    storageMode: config().storageMode,
    core: r.core,
    supabase: r.supabase,
    requestId
  });
});

module.exports = { healthRouter: router };
