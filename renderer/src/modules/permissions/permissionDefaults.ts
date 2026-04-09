import type { PermissionKey } from "./permissionTypes";

/** 本阶段平台默认全开（后续可接后台 / 地区策略） */
export const MOCK_PLATFORM_ENABLED_PERMISSIONS: PermissionKey[] = [
  "fs.read",
  "fs.write",
  "app.control",
  "network.access"
];

const MOCK_USER_GRANTED_FULL: PermissionKey[] = ["fs.read", "fs.write"];

/**
 * 会话内「用户已授权」mock。默认含 fs.read/fs.write（file.organize 直通）。
 * 本地验收：执行 `localStorage.setItem("aics:permission:test:no-write","1")` 后刷新，
 * 可验证缺少 fs.write 时的权限确认链路。
 */
export function getMockUserGrantedPermissions(): PermissionKey[] {
  if (typeof window !== "undefined" && window.localStorage.getItem("aics:permission:test:no-write") === "1") {
    return ["fs.read"];
  }
  return [...MOCK_USER_GRANTED_FULL];
}

/**
 * 验收「平台禁用」：localStorage.setItem("aics:permission:test:deny-fs-write","1")
 * 将从平台可用列表中移除 fs.write。
 */
export function getMockPlatformEnabledPermissions(): PermissionKey[] {
  if (typeof window !== "undefined" && window.localStorage.getItem("aics:permission:test:deny-fs-write") === "1") {
    return MOCK_PLATFORM_ENABLED_PERMISSIONS.filter((p) => p !== "fs.write");
  }
  return [...MOCK_PLATFORM_ENABLED_PERMISSIONS];
}
