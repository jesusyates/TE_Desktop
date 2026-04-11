/**
 * 未验证账号：注册 / 登录 / 重发 共用导航与 query 约定（单一承接页 /verify-email）。
 */

export type VerifyEmailNavigateOpts = {
  /** 首次注册成功，服务端已发验证码邮件 */
  sent?: boolean;
  /** 同邮箱再注册且未验证：进入页后可触发自动重发（见 VerifyEmailPage） */
  resentHint?: boolean;
  /** 登录被 EMAIL_NOT_VERIFIED 拦截 */
  fromLogin?: boolean;
  /** 注册页 409 明确引导（与 resentHint 可并存） */
  fromRegDup?: boolean;
};

export const AUTH_VERIFY_EMAIL_PATH = "/verify-email";

/**
 * @returns 形如 `/verify-email?email=...&sent=1` 的路径（供 React Router）
 */
export function buildVerifyEmailUrl(email: string, opts: VerifyEmailNavigateOpts = {}): string {
  const em = email.trim();
  const q = new URLSearchParams();
  q.set("email", em);
  if (opts.sent) q.set("sent", "1");
  if (opts.resentHint) q.set("resentHint", "1");
  if (opts.fromLogin) q.set("fromLogin", "1");
  if (opts.fromRegDup) q.set("fromRegDup", "1");
  return `${AUTH_VERIFY_EMAIL_PATH}?${q.toString()}`;
}
