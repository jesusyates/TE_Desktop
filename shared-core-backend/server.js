/**
 * 兼容入口：薄包装，实际等同 `node src/main.js`。
 * 主联调 / pm2 / 文档请以 **src/main.js** 为唯一基线；请勿在此增加第二套启动逻辑。
 */
require("./src/main");
