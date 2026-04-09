/**
 * D-7-3O+：Core 数据目录解析。优先 AICS_DATA_DIR，其次 TEST_DATA_DIR，否则 <core>/data。
 */
const path = require("path");

function resolveCoreDataDir() {
  const raw = process.env.AICS_DATA_DIR || process.env.TEST_DATA_DIR;
  if (raw != null && String(raw).trim() !== "") {
    return path.resolve(String(raw).trim());
  }
  return path.join(__dirname, "data");
}

module.exports = { resolveCoreDataDir };
