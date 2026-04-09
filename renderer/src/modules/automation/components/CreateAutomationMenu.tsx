import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { UiCatalog } from "../../../i18n/uiCatalog";
import { createEmptyAutomation } from "../createAutomationFromSource";
import { buildAutomationConsoleUrl } from "../automationNavigation";

export type CreateAutomationMenuProps = {
  u: UiCatalog;
};

export function CreateAutomationMenu({ u }: CreateAutomationMenuProps) {
  const a = u.automation;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);
  const prevOpenRef = useRef(false);
  const menuId = useId();

  const close = () => setOpen(false);

  const goFocus = (id: string) => {
    navigate(buildAutomationConsoleUrl(id), { state: { automationToastShowView: false } });
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    const id = window.requestAnimationFrame(() => firstItemRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(id);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (prevOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    prevOpenRef.current = open;
  }, [open]);

  return (
    <div className="create-automation-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="ui-btn ui-btn--primary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
      >
        {a.create}
      </button>
      {open ? (
        <div id={menuId} className="create-automation-menu__panel" role="menu" aria-label={a.create}>
          <button
            ref={firstItemRef}
            type="button"
            className="create-automation-menu__item"
            role="menuitem"
            onClick={() => {
              const rec = createEmptyAutomation(a.unnamedAutomationTitle);
              goFocus(rec.id);
            }}
          >
            {a.menuBlank}
          </button>
          <button
            type="button"
            className="create-automation-menu__item"
            role="menuitem"
            onClick={() => {
              close();
              navigate("/templates");
            }}
          >
            {a.createFromTemplate}
          </button>
          <button
            type="button"
            className="create-automation-menu__item"
            role="menuitem"
            onClick={() => {
              close();
              navigate("/saved-results");
            }}
          >
            {a.createFromSavedResult}
          </button>
          <button
            type="button"
            className="create-automation-menu__item create-automation-menu__item--disabled"
            role="menuitem"
            disabled
            title={a.fromCurrentDisabledHint}
          >
            {a.createFromCurrentResult}
          </button>
        </div>
      ) : null}
    </div>
  );
}
