/**
 * D-7-3F：与桌面端 permissionRegistry.ts 对齐。
 */

const capabilityPermissionRegistry = {
  "file.organize": {
    capabilityId: "file.organize",
    requiredPermissions: ["fs.read", "fs.write"]
  }
};

function getCapabilityPermissions(capabilityId) {
  const row = capabilityPermissionRegistry[capabilityId];
  const req = row?.requiredPermissions;
  if (!row || !req?.length) return null;
  return req;
}

module.exports = {
  capabilityPermissionRegistry,
  getCapabilityPermissions
};
