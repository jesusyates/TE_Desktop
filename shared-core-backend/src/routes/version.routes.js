const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

router.get("/version", (_req, res) => {
  const pkgPath = path.join(__dirname, "..", "..", "package.json");
  let version = "1.0.0";
  try {
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg.version) version = pkg.version;
  } catch {
    /* fallback */
  }
  res.json({ version });
});

module.exports = { versionRouter: router };
