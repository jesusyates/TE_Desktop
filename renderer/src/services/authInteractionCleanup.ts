/**
 * 进入登录等公共认证路由后：恢复命中与焦点（pointer-events / inert 等残留）。
 */
import { isAuthPublicRoutePath } from "../config/authPublicRoutes";

export type AuthPublicRouteCleanupOptions = {
  /** 在清理与 window 聚焦后，再下一帧聚焦到的首个表单控件 id（打断残留 focus trap / 首击失效） */
  focusFirstInputId?: string;
};

/** 驱散可能卡在工作台 modal / webview 内的焦点链 */
export function blurActiveElementChain(maxIterations = 16): void {
  for (let i = 0; i < maxIterations; i++) {
    const ae = document.activeElement;
    if (!ae || ae === document.body || ae === document.documentElement) return;
    if (ae instanceof HTMLElement) {
      ae.blur();
      continue;
    }
    return;
  }
}

export function releasePointerLockIfAny(): void {
  try {
    if (document.pointerLockElement) document.exitPointerLock();
  } catch {
    /* ignore */
  }
}

/**
 * 进入登录壳后单独复位：blur 后延迟 focus 首个输入框
 */
export function runAuthPublicRouteMountFocusReset(firstInputId: string): void {
  blurActiveElementChain();
  releasePointerLockIfAny();
  queueMicrotask(() => {
    blurActiveElementChain();
  });
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById(firstInputId);
      if (el instanceof HTMLElement) {
        try {
          el.focus({ preventScroll: true });
        } catch {
          try {
            el.focus();
          } catch {
            /* ignore */
          }
        }
      }
    });
  });
}

/**
 * 登录等公共路由：清理可能残留的 pointer-events / 焦点，并轻推合成层刷新命中。
 */
export function runAuthPublicRouteInteractionCleanup(
  _context: string,
  pathname: string,
  options?: AuthPublicRouteCleanupOptions
): void {
  if (!isAuthPublicRoutePath(pathname)) return;

  blurActiveElementChain();
  releasePointerLockIfAny();

  document.body.style.removeProperty("pointer-events");
  document.documentElement.style.removeProperty("pointer-events");
  const root = document.getElementById("root");
  if (root) root.style.removeProperty("pointer-events");

  try {
    document.body.removeAttribute("inert");
    document.documentElement.removeAttribute("inert");
    if (root) root.removeAttribute("inert");
  } catch {
    /* ignore */
  }

  try {
    if (document.body.style.overflow === "hidden") {
      document.body.style.removeProperty("overflow");
    }
  } catch {
    /* ignore */
  }

  blurActiveElementChain();

  /* React 提交卸载后再摘可能残留的 fixed 全屏根（避免与协调器竞态） */
  queueMicrotask(() => {
    try {
      document.querySelectorAll(".trust-gate-dialog, .task-clarification-dialog").forEach((el) => {
        el.remove();
      });
    } catch {
      /* ignore */
    }
  });

  const focusId = options?.focusFirstInputId?.trim();

  requestAnimationFrame(() => {
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      try {
        window.dispatchEvent(new Event("resize"));
      } catch {
        /* ignore */
      }
      if (focusId) {
        requestAnimationFrame(() => {
          const el = document.getElementById(focusId);
          if (el instanceof HTMLElement) {
            try {
              el.focus({ preventScroll: true });
            } catch {
              try {
                el.focus();
              } catch {
                /* ignore */
              }
            }
          }
        });
      }
    });
  });
}
