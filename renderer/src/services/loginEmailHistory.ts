/**
 * 登录邮箱本地历史与后缀补全建议（仅 localStorage，不上云、不缓存密码）。
 */
import { isValidEmailFormat, normalizeEmailInput } from "../modules/auth/authValidation";

export const LOGIN_EMAIL_HISTORY_STORAGE_KEY = "aics_login_email_history";

const MAX_HISTORY_ITEMS = 10;
const MAX_EMAIL_SUGGESTIONS = 8;

/** 内置常见邮箱后缀（顺序用于无 @ 时的展示顺序） */
const BUILTIN_EMAIL_DOMAINS = [
  "qq.com",
  "gmail.com",
  "outlook.com",
  "163.com",
  "126.com",
  "hotmail.com",
  "icloud.com"
] as const;

export type LoginEmailHistoryItem = {
  email: string;
  lastUsedAt: string;
  useCount: number;
};

export type SuggestionItem = {
  value: string;
  source: "history" | "domain";
  rank: number;
};

export type GetEmailSuggestionsOptions = {
  /** 默认 true。为 false 时不读取/返回历史项，空输入返回 []。 */
  enableHistory?: boolean;
  /** 默认 true。为 false 时不返回后缀补全项。 */
  enableDomainSuggest?: boolean;
};

function readRaw(): LoginEmailHistoryItem[] {
  try {
    const raw = localStorage.getItem(LOGIN_EMAIL_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: LoginEmailHistoryItem[] = [];
    for (const x of parsed) {
      if (!x || typeof x !== "object") continue;
      const o = x as Record<string, unknown>;
      if (typeof o.email !== "string" || typeof o.lastUsedAt !== "string" || typeof o.useCount !== "number") {
        continue;
      }
      const email = o.email.trim().toLowerCase();
      if (!email) continue;
      out.push({
        email,
        lastUsedAt: o.lastUsedAt,
        useCount: Math.max(0, Math.floor(o.useCount))
      });
    }
    return out;
  } catch {
    return [];
  }
}

function writeRaw(items: LoginEmailHistoryItem[]): void {
  try {
    localStorage.setItem(LOGIN_EMAIL_HISTORY_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota / 隐私模式 */
  }
}

/** 最近使用在前，最多 10 条 */
export function listLoginEmailHistory(): LoginEmailHistoryItem[] {
  const all = readRaw();
  all.sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt));
  return all.slice(0, MAX_HISTORY_ITEMS);
}

/**
 * 仅在登录成功（已拿到会话）后调用；失败或未验证通过勿调用。
 */
export function recordLoginEmailSuccess(email: string): void {
  const norm = normalizeEmailInput(email).toLowerCase();
  if (!norm || !isValidEmailFormat(norm)) return;

  let all = readRaw();
  const idx = all.findIndex((i) => i.email === norm);
  const now = new Date().toISOString();
  if (idx >= 0) {
    const prev = all[idx]!;
    all.splice(idx, 1);
    all.unshift({
      email: norm,
      lastUsedAt: now,
      useCount: prev.useCount + 1
    });
  } else {
    all.unshift({ email: norm, lastUsedAt: now, useCount: 1 });
  }
  all.sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt));
  all = all.slice(0, MAX_HISTORY_ITEMS);
  writeRaw(all);
}

export function removeLoginEmailHistory(email: string): void {
  const norm = normalizeEmailInput(email).toLowerCase();
  if (!norm) return;
  const all = readRaw().filter((i) => i.email !== norm);
  writeRaw(all);
}

export function clearLoginEmailHistory(): void {
  try {
    localStorage.removeItem(LOGIN_EMAIL_HISTORY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** 根据当前输入生成 @后缀补全候选（不含与历史合并、不去重） */
function buildDomainSuffixCandidates(input: string): string[] {
  const q = normalizeEmailInput(input);
  if (!q) return [];

  const at = q.indexOf("@");
  if (at < 0) {
    return BUILTIN_EMAIL_DOMAINS.map((d) => `${q}@${d}`);
  }

  const local = q.slice(0, at);
  const domPart = q.slice(at + 1).toLowerCase();
  if (!local) return [];

  return BUILTIN_EMAIL_DOMAINS.filter((d) => domPart === "" || d.startsWith(domPart)).map((d) => `${local}@${d}`);
}

/**
 * 统一建议：先匹配历史（最近优先），再后缀补全；去重；最多 8 条。
 * 输入为空且开启历史时仅返回历史（至多 8 条）；关闭历史时空输入返回 []。
 */
export function getEmailSuggestions(input: string, options?: GetEmailSuggestionsOptions): SuggestionItem[] {
  const enableHistory = options?.enableHistory !== false;
  const enableDomainSuggest = options?.enableDomainSuggest !== false;
  const q = normalizeEmailInput(input);
  const history = enableHistory ? listLoginEmailHistory() : [];
  const seen = new Set<string>();
  const out: SuggestionItem[] = [];

  const tryPush = (value: string, source: "history" | "domain", rank: number) => {
    const k = value.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ value, source, rank });
  };

  if (!enableHistory && !enableDomainSuggest) {
    return [];
  }

  if (q === "") {
    if (!enableHistory) return [];
    let r = 0;
    for (const h of history) {
      tryPush(h.email, "history", r++);
      if (out.length >= MAX_EMAIL_SUGGESTIONS) break;
    }
    return out;
  }

  let rank = 0;
  if (enableHistory) {
    for (const h of history) {
      if (!h.email.toLowerCase().startsWith(q.toLowerCase())) continue;
      tryPush(h.email, "history", rank++);
      if (out.length >= MAX_EMAIL_SUGGESTIONS) return out;
    }
  }

  if (enableDomainSuggest) {
    let dr = 0;
    for (const cand of buildDomainSuffixCandidates(q)) {
      tryPush(cand, "domain", 100 + dr++);
      if (out.length >= MAX_EMAIL_SUGGESTIONS) break;
    }
  }

  return out;
}
