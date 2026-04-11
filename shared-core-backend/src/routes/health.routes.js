const express = require("express");
const path = require("path");
const fs = require("fs");
const { config } = require("../infra/config");
const { checkReady } = require("../infra/db/ready-check");
const { sendSystemSuccess, sendSystemFailure } = require("../infra/apiResponse");

const router = express.Router();

function readPackageVersion() {
  const pkgPath = path.join(__dirname, "..", "..", "package.json");
  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    return pkg.version ? String(pkg.version) : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

router.get("/health", (req, res) => {
  const c = config();
  return sendSystemSuccess(
    res,
    req,
    {
      status: "ok",
      service: c.serviceName,
      env: c.nodeEnv,
      uptime: Math.round(process.uptime()),
      version: readPackageVersion(),
      domainStorageMode: c.domainStorageMode
    },
    200
  );
});

router.get("/ready", async (req, res) => {
  const r = await checkReady();
  if (!r.ok) {
    return sendSystemFailure(
      res,
      req,
      503,
      "DEPENDENCY_UNAVAILABLE",
      r.error || "Dependency not ready"
    );
  }
  const c = config();
  return sendSystemSuccess(
    res,
    req,
    {
      ready: true,
      service: c.serviceName,
      storageMode: c.storageMode,
      domainStorageMode: c.domainStorageMode,
      core: r.core,
      supabase: r.supabase,
      env: r.envCheck || undefined
    },
    200
  );
});

module.exports = { healthRouter: router };
