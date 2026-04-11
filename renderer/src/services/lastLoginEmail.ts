const STORAGE_KEY = "aics_last_login_email";

export function getLastLoginEmail(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

/** 仅在登录成功后调用；不缓存密码。 */
export function setLastLoginEmail(email: string): void {
  const t = email.trim();
  if (!t) return;
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* 无痕模式 / 配额等 */
  }
}

/** 可选：清掉上次登录邮箱缓存（按需由登出/设置流调用） */
export function clearLastLoginEmail(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
