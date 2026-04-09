/**
 * D-7-3V：Core /safety-check、/permission-check 分级协议 → 前端 SafetyCheckResult / PermissionCheckResult。
 * 映射集中在此，业务与 UI 不散落解析逻辑。
 */

import type { PermissionCheckResult, PermissionKey } from "../modules/permissions/permissionTypes";
import type { SafetyCheckResult, SafetyIssue } from "../modules/safety/safetyTypes";
import type { AuthRequirementLevel } from "./riskTierPolicy";
import { inferRiskControlFields } from "./riskTierPolicy";

export type CoreTieredDecision = "allow" | "warn" | "confirm" | "block";
export type CoreTieredLevel = "low" | "medium" | "high" | "critical";

const PERMISSION_KEY_ORDER = ["fs.read", "fs.write", "app.control", "network.access"] as const;
const PERMISSION_KEY_SET = new Set<string>(PERMISSION_KEY_ORDER);

function coercePermissionKeys(arr: unknown): PermissionKey[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is PermissionKey => typeof x === "string" && PERMISSION_KEY_SET.has(x));
}

function parseCodes(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function parseTierLevel(v: unknown): CoreTieredLevel | undefined {
  if (v === "low" || v === "medium" || v === "high" || v === "critical") return v;
  return undefined;
}

function normalizeSafetyDecision(v: unknown): CoreTieredDecision | null {
  if (v === "allow" || v === "warn" || v === "confirm" || v === "block") return v;
  return null;
}

function normalizePermissionDecision(v: unknown): PermissionCheckResult["decision"] | null {
  if (v === "deny") return "block";
  if (v === "allow" || v === "warn" || v === "confirm" || v === "block") return v;
  return null;
}

function issueLevelFromTier(lev: CoreTieredLevel | undefined): SafetyIssue["level"] {
  if (lev === "low") return "low";
  if (lev === "high") return "high";
  if (lev === "critical") return "critical";
  return "medium";
}

function parseAuthRequirement(v: unknown): AuthRequirementLevel | undefined {
  if (v === "none" || v === "login" || v === "verified") return v;
  return undefined;
}

function mergeRiskControlFromPayload(
  raw: Record<string, unknown>,
  decision: CoreTieredDecision,
  level: CoreTieredLevel | undefined
): Pick<SafetyCheckResult, "authRequirement" | "interruptible" | "auditRequired"> {
  const inferred = inferRiskControlFields(decision, level);
  return {
    authRequirement: parseAuthRequirement(raw.authRequirement) ?? inferred.authRequirement,
    interruptible:
      typeof raw.interruptible === "boolean" ? raw.interruptible : inferred.interruptible,
    auditRequired:
      typeof raw.auditRequired === "boolean" ? raw.auditRequired : inferred.auditRequired
  };
}

/**
 * 解析 Core safety 对象（D-7-3V 或旧版 decision+issues）。
 */
export function adaptCoreSafetyPayload(raw: unknown): SafetyCheckResult | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;

  const dec = normalizeSafetyDecision(s.decision);
  if (!dec) return null;

  const issuesParsed: SafetyIssue[] = [];
  if (Array.isArray(s.issues)) {
    for (const it of s.issues) {
      if (!it || typeof it !== "object") continue;
      const i = it as Record<string, unknown>;
      const code = typeof i.code === "string" ? i.code : "";
      const message = typeof i.message === "string" ? i.message : "";
      const level =
        i.level === "low" || i.level === "medium" || i.level === "high" || i.level === "critical"
          ? i.level
          : ("medium" as const);
      if (code && message) issuesParsed.push({ code, message, level });
    }
  }

  if (!issuesParsed.length && dec !== "allow") {
    if (typeof s.reason === "string" && s.reason.trim()) {
      const tier = parseTierLevel(s.level);
      issuesParsed.push({
        code: parseCodes(s.codes)[0] ?? "core_safety",
        message: s.reason.trim(),
        level: issueLevelFromTier(tier)
      });
    } else {
      return null;
    }
  }

  const tierLevel = parseTierLevel(s.level);
  const reason =
    typeof s.reason === "string" && s.reason.trim()
      ? s.reason.trim()
      : issuesParsed.map((x) => x.message).join(" ");
  let codes = parseCodes(s.codes);
  if (!codes.length && issuesParsed.length) codes = issuesParsed.map((i) => i.code);

  const levelOut: SafetyCheckResult["level"] =
    tierLevel ??
    (dec === "allow" ? "low" : dec === "block" ? "high" : dec === "warn" ? "medium" : "medium");

  return {
    decision: dec,
    issues: dec === "allow" ? [] : issuesParsed,
    level: levelOut,
    reason: dec === "allow" ? "" : reason,
    codes: dec === "allow" ? [] : codes,
    ...mergeRiskControlFromPayload(s, dec, levelOut)
  };
}

/**
 * 解析 Core permission 对象（D-7-3V；deny → block）。
 */
export function adaptCorePermissionPayload(raw: unknown): PermissionCheckResult | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;

  const decision = normalizePermissionDecision(p.decision);
  if (!decision) return null;

  const missingUserPermissions = coercePermissionKeys(p.missingUserPermissions);
  const blockedByPlatform = coercePermissionKeys(p.blockedByPlatform);
  const message = "message" in p && typeof p.message === "string" ? p.message : undefined;
  const reason =
    typeof p.reason === "string" && p.reason.trim()
      ? p.reason.trim()
      : message ?? "";
  let codes = parseCodes(p.codes);
  const levelRaw = parseTierLevel(p.level) as PermissionCheckResult["level"] | undefined;

  if (!codes.length) {
    if (decision === "confirm") codes = ["permission_confirm"];
    else if (decision === "block") codes = blockedByPlatform.length ? ["platform_blocked"] : ["blocked"];
    else if (decision === "warn") codes = ["permission_warn"];
  }

  const levelOut: PermissionCheckResult["level"] =
    levelRaw ??
    (decision === "allow" ? "low" : decision === "block" ? "high" : decision === "warn" ? "medium" : "medium");

  return {
    decision,
    missingUserPermissions,
    blockedByPlatform,
    ...(message != null ? { message } : {}),
    level: levelOut,
    reason,
    codes,
    ...mergeRiskControlFromPayload(p, decision, levelOut)
  };
}
