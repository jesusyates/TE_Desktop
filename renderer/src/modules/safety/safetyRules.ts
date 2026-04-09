/**
 * D-6-1：规则版安全词表（集中管理，可替换为模型或策略引擎）。
 */

/** 违规：直接拦截 */
export const FORBIDDEN_KEYWORDS = [
  "攻击",
  "破解",
  "绕过",
  "窃取",
  "病毒",
  "attack",
  "exploit",
  "bypass",
  "steal",
  "malware"
] as const;

/** 高风险：需人工确认后再执行 */
export const HIGH_RISK_KEYWORDS = [
  "删除",
  "清空",
  "覆盖",
  "批量删除",
  "delete",
  "remove",
  "overwrite",
  "wipe"
] as const;
