/**
 * D-7-3E：与桌面端 safetyRules.ts 对齐（规则版）。
 */

/** 违规：直接拦截 */
const FORBIDDEN_KEYWORDS = [
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
];

/** 高风险：需人工确认后再执行 */
const HIGH_RISK_KEYWORDS = [
  "删除",
  "清空",
  "覆盖",
  "批量删除",
  "delete",
  "remove",
  "overwrite",
  "wipe"
];

module.exports = { FORBIDDEN_KEYWORDS, HIGH_RISK_KEYWORDS };
