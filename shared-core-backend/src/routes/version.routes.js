const express = require("express");
const path = require("path");
const fs = require("fs");
const { readEnv } = require("../infra/config");
const { sendSystemSuccess } = require("../infra/apiResponse");

const router = express.Router();

router.get("/version", (req, res) => {
  const pkgPath = path.join(__dirname, "..", "..", "package.json");
  let version = "1.0.0";
  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg.version) version = pkg.version;
  } catch {
    /* fallback */
  }
  const build = readEnv("BUILD_ID", readEnv("CI_BUILD_NUMBER", ""));
  const commit = readEnv("GIT_COMMIT", readEnv("SOURCE_VERSION", readEnv("VERCEL_GIT_COMMIT_SHA", "")));
  return sendSystemSuccess(
    res,
    req,
    {
      version,
      build: build || null,
      commit: commit || null
    },
    200
  );
});

module.exports = { versionRouter: router };
