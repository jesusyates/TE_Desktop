import { AuthLocaleSwitcher } from "./AuthLocaleSwitcher";

type Props = {
  title: string;
  meta: string;
};

/** 登录前页面统一顶栏：标题区 + 全局语言切换（与 authStore.locale 同源） */
export function AuthPublicShellHeader({ title, meta }: Props) {
  return (
    <header className="shell-header">
      <div className="shell-header__brand">
        <span className="shell-header__title">{title}</span>
        <span className="shell-header__meta">{meta}</span>
      </div>
      <AuthLocaleSwitcher className="shell-header__locale" />
    </header>
  );
}
