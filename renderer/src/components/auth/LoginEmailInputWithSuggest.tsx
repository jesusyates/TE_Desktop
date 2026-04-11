import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { Input } from "../ui/Input";
import {
  clearLoginEmailHistory,
  getEmailSuggestions,
  listLoginEmailHistory,
  removeLoginEmailHistory,
  type SuggestionItem
} from "../../services/loginEmailHistory";

const BLUR_CLOSE_MS = 180;

export type LoginEmailSuggestLabels = {
  recentBadge: string;
  recommendedBadge: string;
  clearHistory: string;
  removeFromHistoryAria: string;
};

type Props = {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoComplete?: string;
  /** 默认 true。false 时不展示/操作本机登录邮箱历史（如注册页仅后缀补全）。 */
  enableHistory?: boolean;
  /** 默认 true。false 时不展示内置后缀补全。 */
  enableDomainSuggest?: boolean;
  labels: LoginEmailSuggestLabels;
};

export function LoginEmailInputWithSuggest({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = "username",
  enableHistory = true,
  enableDomainSuggest = true,
  labels
}: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [historyRev, setHistoryRev] = useState(0);

  const suggestOptions = useMemo(
    () => ({ enableHistory, enableDomainSuggest }),
    [enableHistory, enableDomainSuggest]
  );

  const suggestions = useMemo(() => {
    const raw = getEmailSuggestions(value, suggestOptions);
    return raw.filter((s) => {
      if (s.source === "history" && !enableHistory) return false;
      if (s.source === "domain" && !enableDomainSuggest) return false;
      return true;
    });
  }, [value, historyRev, suggestOptions, enableHistory, enableDomainSuggest]);

  const hasHistory = useMemo(
    () => enableHistory && listLoginEmailHistory().length > 0,
    [historyRev, enableHistory]
  );

  const showPanel = open && (suggestions.length > 0 || hasHistory);

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current != null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      setOpen(false);
    }, BLUR_CLOSE_MS);
  }, [clearBlurTimer]);

  const openPanel = useCallback(() => {
    clearBlurTimer();
    setOpen(true);
  }, [clearBlurTimer]);

  const bumpHistory = useCallback(() => {
    setHistoryRev((n) => n + 1);
  }, []);

  const applySuggestion = useCallback(
    (item: SuggestionItem) => {
      onChange(item.value);
      setHighlight(0);
      setOpen(false);
      clearBlurTimer();
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [onChange, clearBlurTimer]
  );

  useLayoutEffect(() => {
    if (highlight >= suggestions.length) {
      setHighlight(Math.max(0, suggestions.length - 1));
    }
  }, [highlight, suggestions.length]);

  useEffect(() => {
    if (open) setHighlight(0);
  }, [value, open]);

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!showPanel) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const next = getEmailSuggestions(value, suggestOptions);
        if (next.length > 0) {
          e.preventDefault();
          openPanel();
        }
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      clearBlurTimer();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setHighlight((h) => (h + 1) % suggestions.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (e.key === "Enter") {
      if (suggestions.length > 0 && suggestions[highlight]) {
        e.preventDefault();
        applySuggestion(suggestions[highlight]!);
      }
    }
  };

  const onRemoveHistory = (email: string, ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    clearBlurTimer();
    removeLoginEmailHistory(email);
    bumpHistory();
    openPanel();
  };

  const onClearAll = (ev: React.MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    clearLoginEmailHistory();
    bumpHistory();
    setOpen(false);
    clearBlurTimer();
  };

  return (
    <div className="login-email-suggest-wrap">
      <Input
        ref={inputRef}
        id={id}
        type="email"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={openPanel}
        onBlur={scheduleClose}
        onKeyDown={onInputKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={
          showPanel && suggestions.length > 0 ? `${id}-opt-${highlight}` : undefined
        }
      />
      {showPanel ? (
        <div
          id={listId}
          className="login-email-suggest-panel"
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.length > 0 ? (
            <ul className="login-email-suggest-list">
              {suggestions.map((item, idx) => (
                <li key={`${item.source}:${item.value}:${idx}`} className="login-email-suggest-li">
                  <button
                    type="button"
                    id={`${id}-opt-${idx}`}
                    role="option"
                    aria-selected={idx === highlight}
                    className={[
                      "login-email-suggest-row",
                      idx === highlight ? "login-email-suggest-row--active" : ""
                    ].join(" ")}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => applySuggestion(item)}
                  >
                    <span className="login-email-suggest-value">{item.value}</span>
                    <span className="login-email-suggest-meta">
                      {item.source === "history" && enableHistory ? (
                        <span className="login-email-suggest-badge login-email-suggest-badge--history">
                          {labels.recentBadge}
                        </span>
                      ) : null}
                      {item.source === "domain" && enableDomainSuggest ? (
                        <span className="login-email-suggest-badge login-email-suggest-badge--domain">
                          {labels.recommendedBadge}
                        </span>
                      ) : null}
                      {enableHistory && item.source === "history" ? (
                        <button
                          type="button"
                          className="login-email-suggest-remove-btn"
                          aria-label={`${labels.removeFromHistoryAria} ${item.value}`}
                          onMouseDown={(e) => onRemoveHistory(item.value, e)}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {hasHistory ? (
            <div className="login-email-suggest-footer">
              <button type="button" className="login-email-suggest-clear" onClick={onClearAll}>
                {labels.clearHistory}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
