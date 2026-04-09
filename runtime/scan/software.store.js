let lastSnapshot = {
  tools: [],
  scannedAt: null,
  platform: "unknown"
};

function setSoftwareScan(tools, platform) {
  lastSnapshot = {
    tools: Array.isArray(tools) ? tools : [],
    scannedAt: new Date().toISOString(),
    platform: platform || "unknown"
  };
}

function getSoftwareScan() {
  return { ...lastSnapshot, tools: lastSnapshot.tools.slice() };
}

module.exports = { setSoftwareScan, getSoftwareScan };
