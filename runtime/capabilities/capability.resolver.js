const { getCapability, getAllCapabilities } = require("./capability.registry");

/**
 * 从用户输入与步骤标题推断可能需要的 capability ids（仅关键字，不出现具体软件名）。
 * @param {string} oneLine
 * @param {string[]} stepTitles
 * @returns {string[]}
 */
function inferRequiredCapabilities(oneLine, stepTitles) {
  const all = getAllCapabilities();
  const hay = [oneLine || "", ...(stepTitles || []).map((t) => t || "")]
    .join(" ")
    .toLowerCase();
  const out = [];
  for (const def of all) {
    const kws = def.infer_keywords || [];
    if (kws.some((k) => k && hay.includes(String(k).toLowerCase()))) {
      out.push(def.capability);
    }
  }
  return [...new Set(out)];
}

/**
 * @param {import('./capability.schema.js').ScannedTool[]} availableTools
 * @param {string} capabilityId
 * @returns {{ capability: string; chosen: import('./capability.schema.js').ScannedTool | null; candidatesTried: string[] }}
 */
function resolveToolForCapability(availableTools, capabilityId) {
  const def = getCapability(capabilityId);
  const candidatesTried = def ? def.tool_candidates.slice() : [];
  if (!def || def.tool_candidates.length === 0) {
    return { capability: capabilityId, chosen: null, candidatesTried };
  }
  const byId = new Map((availableTools || []).map((t) => [t.tool_id, t]));
  for (const tid of def.tool_candidates) {
    const hit = byId.get(tid);
    if (hit && hit.status === "available") return { capability: capabilityId, chosen: hit, candidatesTried };
  }
  return { capability: capabilityId, chosen: null, candidatesTried };
}

/**
 * @param {import('./capability.schema.js').ScannedTool[]} availableTools
 * @param {string[]} requiredCapabilityIds
 */
function resolveAll(availableTools, requiredCapabilityIds) {
  const required = [...new Set(requiredCapabilityIds || [])];
  return required.map((cap) => {
    const r = resolveToolForCapability(availableTools, cap);
    return { ...r, satisfied: Boolean(r.chosen) };
  });
}

module.exports = {
  inferRequiredCapabilities,
  resolveToolForCapability,
  resolveAll
};
