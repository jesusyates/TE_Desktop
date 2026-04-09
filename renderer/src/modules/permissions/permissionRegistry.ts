import type { CapabilityPermissionDeclaration, PermissionKey } from "./permissionTypes";

/** capabilityId → 声明（未登记视为未声明，执行前一律 deny） */
export const capabilityPermissionRegistry: Record<string, CapabilityPermissionDeclaration> = {
  "file.organize": {
    capabilityId: "file.organize",
    requiredPermissions: ["fs.read", "fs.write"]
  }
};

export function getCapabilityPermissions(capabilityId: string): PermissionKey[] | null {
  const row = capabilityPermissionRegistry[capabilityId];
  const req = row?.requiredPermissions;
  if (!row || !req?.length) return null;
  return req;
}
