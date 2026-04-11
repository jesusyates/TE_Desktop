import { useUiStrings } from "../../i18n/useUiStrings";
import { useAuthStore } from "../../store/authStore";
import { defaultMarketForLocale } from "../../services/displayLocale";

const ORDER = ["zh-CN", "en-US", "ja-JP"] as const;

type Props = { className?: string };

/**
 * 登录前语言切换：写入 authStore + localStorage，并设置 user-lock（优先级高于账号 /me locale）。
 */
export function AuthLocaleSwitcher({ className }: Props) {
  const u = useUiStrings();
  const ap = u.authPublic;
  const locale = useAuthStore((s) => s.locale);
  const setSessionLocale = useAuthStore((s) => s.setSessionLocale);

  const labelFor = (loc: (typeof ORDER)[number]) => {
    if (loc === "zh-CN") return ap.localeZhCN;
    if (loc === "en-US") return ap.localeEnUS;
    return ap.localeJaJP;
  };

  return (
    <div
      className={["auth-locale-switcher", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={ap.languageLabel}
    >
      {ORDER.map((loc) => (
        <button
          key={loc}
          type="button"
          className={`auth-locale-switcher__btn${locale === loc ? " auth-locale-switcher__btn--active" : ""}`}
          aria-pressed={locale === loc}
          onClick={() =>
            setSessionLocale(defaultMarketForLocale(loc), loc, { fromUserPicker: true })
          }
        >
          {labelFor(loc)}
        </button>
      ))}
    </div>
  );
}
