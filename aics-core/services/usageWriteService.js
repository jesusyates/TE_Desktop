/**
 * D-7-3M：Usage 写入收口（与 /result 成功后的非阻塞 append 一致）。
 */
const { appendUsage } = require("../usageStore");
const { normalizeUsageFromResultBody } = require("../schema/usageSchema");

function buildUsageRecordFromResultBody(body, ctx) {
  return normalizeUsageFromResultBody(body, ctx);
}

/**
 * 与原先一致：先构建 record，再 setImmediate + try/catch，失败不影响 /result。
 */
function scheduleAppendUsageFromResult(body, ctx) {
  const usageRecord = normalizeUsageFromResultBody(body, ctx);
  setImmediate(() => {
    try {
      appendUsage(usageRecord);
    } catch {
      /* usage 失败不影响 /result */
    }
  });
}

module.exports = { buildUsageRecordFromResultBody, scheduleAppendUsageFromResult };
