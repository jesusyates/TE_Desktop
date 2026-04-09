const fs = require("fs");
const path = require("path");
const { listProfiles } = require("../capabilities/tool-candidates.config");

/**
 * @param {string} filePath
 * @returns {import('../capabilities/capability.schema.js').ScannedTool[]}
 */
function matchPathToTools(filePath) {
  const norm = String(filePath || "").trim();
  if (!norm) return [];
  const base = path.basename(norm).toUpperCase();
  const profiles = listProfiles();
  const out = [];
  for (const [tool_id, prof] of Object.entries(profiles)) {
    if (prof.exe.some((e) => base === String(e).toUpperCase() || norm.toLowerCase().includes(String(e).toLowerCase()))) {
      out.push(buildRecord(tool_id, prof, norm, base));
    }
  }
  return out;
}

function buildRecord(tool_id, prof, installPath, processNameGuess) {
  const display_name = prof.display["zh-CN"] || prof.display["en-US"] || tool_id;
  return {
    tool_id,
    display_name,
    capabilities: prof.caps.slice(),
    status: "available",
    match: {
      process_name: processNameGuess,
      install_path: installPath
    },
    source: "system_scan"
  };
}

/**
 * @param {string} dir
 * @param {string} exeName
 */
function fileExistsCaseInsensitive(dir, exeName) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const target = exeName.toLowerCase();
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase() === target) {
        return path.join(dir, e.name);
      }
    }
  } catch {
    return null;
  }
  return null;
}

module.exports = { matchPathToTools, fileExistsCaseInsensitive };
