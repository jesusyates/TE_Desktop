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
