/**
 * @deprecated Prefer src/main.js bootstrap；保留本文件供脚本 `require("./load-env")` 兼容。
 */
const { bootstrapEnv } = require("./src/infra/config/bootstrap-env");
bootstrapEnv();
