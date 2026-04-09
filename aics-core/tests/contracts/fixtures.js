/**
 * D-7-3O：契约 smoke 最小 fixtures（仅结构示例，不含敏感数据）。
 */

function minimalContentResult() {
  return {
    kind: "content",
    title: "contract-smoke",
    body: "fixture body"
  };
}

/** @param {string} runId */
function postResultBody(runId, promptSuffix = "") {
  const suffix = promptSuffix || String(Date.now());
  return {
    runId,
    prompt: `contract-smoke-prompt ${suffix}`,
    result: minimalContentResult()
  };
}

/** @param {string} promptSuffix */
function postMemoryRecordBody(promptSuffix = "") {
  const s = promptSuffix || String(Date.now());
  return {
    prompt: `contract-smoke-memory ${s}`,
    requestedMode: "content",
    resolvedMode: "content",
    intent: "smoke",
    capabilityIds: ["smoke.cap"],
    success: true
  };
}

module.exports = {
  minimalContentResult,
  postResultBody,
  postMemoryRecordBody
};
