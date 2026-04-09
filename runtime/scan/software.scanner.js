const fs = require("fs");
const path = require("path");
const os = require("os");
const { listProfiles } = require("../capabilities/tool-candidates.config");
const { fileExistsCaseInsensitive } = require("./software.matcher");

const isWin = process.platform === "win32";

/**
 * 常见安装目录（Windows 第一版）。
 */
function candidateDirs() {
  if (!isWin) return [];
  const h = process.env.LOCALAPPDATA || "";
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const appData = process.env.APPDATA || "";
  return [
    path.join(pf, "Microsoft Office", "root", "Office16"),
    path.join(pf86, "Microsoft Office", "root", "Office16"),
    path.join(pf, "Microsoft Office", "Office16"),
    path.join(pf, "Kingsoft", "WPS Office"),
    path.join(pf86, "Kingsoft", "WPS Office"),
    path.join(appData, "Kingsoft", "WPS Office"),
    path.join(pf, "LibreOffice", "program"),
    path.join(pf86, "LibreOffice", "program"),
    path.join(pf, "Adobe", "Adobe Premiere Pro 2024"),
    path.join(pf, "Adobe", "Adobe Premiere Pro 2023"),
    path.join(pf, "Adobe", "Adobe Photoshop 2024"),
    path.join(pf, "Adobe", "Adobe Photoshop 2023"),
    path.join(h, "CapCut", "Apps"),
    path.join(pf, "CapCut")
  ];
}

/**
 * @returns {import('../capabilities/capability.schema.js').ScannedTool[]}
 */
function scanInstalledSoftware() {
  if (!isWin) {
    return [];
  }
  const profiles = listProfiles();
  /** @type {Map<string, import('../capabilities/capability.schema.js').ScannedTool>} */
  const found = new Map();

  for (const dir of candidateDirs()) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const [tool_id, prof] of Object.entries(profiles)) {
      if (found.has(tool_id)) continue;
      for (const exe of prof.exe) {
        const hit = fileExistsCaseInsensitive(dir, exe);
        if (hit) {
          const display_name = prof.display["zh-CN"] || prof.display["en-US"] || tool_id;
          found.set(tool_id, {
            tool_id,
            display_name,
            capabilities: prof.caps.slice(),
            status: "available",
            match: {
              process_name: path.basename(hit).toUpperCase(),
              install_path: hit
            },
            source: "system_scan"
          });
          break;
        }
      }
    }
  }

  return [...found.values()];
}

function getScanMeta() {
  return {
    platform: process.platform,
    hostname: os.hostname(),
    scannedAt: new Date().toISOString()
  };
}

module.exports = { scanInstalledSoftware, getScanMeta, candidateDirs };
