/**
 * D-7-3F + D-7-3V：与桌面 permission 对齐；deny 已并入 block；完整分级字段。
 */
const { getCapabilityPermissions } = require("./permissionRegistry");
const { enrichRiskControl } = require("./riskTierMeta");

function tierPermission(decision, level, reason, codes, extra = {}) {
  return {
    success: true,
    decision,
    level,
    reason,
    codes,
    ...enrichRiskControl(decision, level),
    ...extra
  };
}

/**
 * @param {{
 *   capabilityRequiredPermissions: string[],
 *   platformEnabledPermissions: string[],
 *   userGrantedPermissions: string[]
 * }} input
 */
function checkPermissionsCore(input) {
  const { capabilityRequiredPermissions, platformEnabledPermissions, userGrantedPermissions } = input;

  const blockedByPlatform = capabilityRequiredPermissions.filter(
    (p) => !platformEnabledPermissions.includes(p)
  );

  if (blockedByPlatform.length) {
    const message = `该操作已被平台禁用，缺少：${blockedByPlatform.join("、")}。`;
    return tierPermission("block", "high", message, ["platform_blocked"], {
      missingUserPermissions: [],
      blockedByPlatform,
      message
    });
  }

  const missingUserPermissions = capabilityRequiredPermissions.filter(
    (p) => !userGrantedPermissions.includes(p)
  );

  if (missingUserPermissions.length) {
    const message = `本次任务需要以下权限：${missingUserPermissions.join("、")}。`;
    return tierPermission("confirm", "medium", message, ["permission_confirm"], {
      missingUserPermissions,
      blockedByPlatform: [],
      message
    });
  }

  return tierPermission("allow", "low", "", [], {
    missingUserPermissions: [],
    blockedByPlatform: []
  });
}

const PERMISSION_KEYS = new Set(["fs.read", "fs.write", "app.control", "network.access"]);

function coercePermissionList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => typeof x === "string" && PERMISSION_KEYS.has(x));
}

/** 未声明能力 → block */
function runPermissionCheckForCapability(body) {
  const capabilityId = typeof body.capabilityId === "string" ? body.capabilityId.trim() : "";
  if (!capabilityId) {
    const message = "缺少 capabilityId。";
    return tierPermission("block", "high", message, ["missing_capability_id"], {
      missingUserPermissions: [],
      blockedByPlatform: [],
      message
    });
  }

  const required = getCapabilityPermissions(capabilityId);
  if (required == null) {
    const message = "能力未在 permissionRegistry 中登记或非空 requiredPermissions。";
    return tierPermission("block", "high", message, ["capability_not_registered"], {
      missingUserPermissions: [],
      blockedByPlatform: [],
      message
    });
  }

  const userGrantedPermissions = coercePermissionList(body.userGrantedPermissions);
  const rawPlatform = body.platformEnabledPermissions;
  const platformEnabledPermissions =
    rawPlatform === undefined || rawPlatform === null
      ? ["fs.read", "fs.write", "app.control", "network.access"]
      : coercePermissionList(rawPlatform);

  return checkPermissionsCore({
    capabilityId,
    userGrantedPermissions,
    platformEnabledPermissions,
    capabilityRequiredPermissions: required
  });
}

module.exports = {
  checkPermissionsCore,
  runPermissionCheckForCapability,
  PERMISSION_KEYS
};
