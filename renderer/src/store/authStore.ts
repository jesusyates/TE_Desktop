import { create } from "zustand";
import { AuthMeFailure, fetchAuthMe, fetchAuthMeValidated, logoutRequest } from "../services/authApi";
import {
  getInitialDisplayLocale,
  getInitialDisplayMarket,
  persistDisplayLocale,
  persistDisplayMarket
} from "../services/displayLocale";
import {
  clearTokenVault,
  clientSession,
  persistAccessRefreshTokens,
  readRefreshTokenFromVault
} from "../services/clientSession";

export type SessionSyncStatus = "synced" | "refresh_pending";

type AuthState = {
  accessToken: string;
  refreshToken: string;
  /** Shared Core `user_id`，未登录为空；须与 /auth/me 或登录接口一致，禁止仅因本地有 token 置位 */
  userId: string;
  /** MODULE C-1：登录接口返回的邮箱（展示用） */
  userEmail: string;
  market: string;
  locale: string;
  sessionSyncStatus: SessionSyncStatus;
  /** MODULE C-3：bootstrap 完成前为 false，避免工作台闪屏 */
  hydrated: boolean;
  /** MODULE C-3：冷启动读 vault → /auth/me 校验后再置 true */
  hydrate: () => Promise<void>;
  setTokens: (
    access: string,
    refresh: string,
    meta?: { userId?: string; userEmail?: string }
  ) => Promise<void>;
  setSessionLocale: (market: string, locale: string) => void;
  setSyncStatus: (status: SessionSyncStatus) => void;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: "",
  refreshToken: "",
  userId: "",
  userEmail: "",
  market: getInitialDisplayMarket(),
  locale: getInitialDisplayLocale(),
  sessionSyncStatus: "synced",
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;

    let access = (await clientSession.getAccessTokenTrimmed()) || "";
    const rt0 = ((await readRefreshTokenFromVault()) || "").trim();

    if (!access && rt0) {
      const { tryRefreshSession } = await import("../services/authSilentRefresh");
      const ok = await tryRefreshSession();
      if (!ok) {
        await clearTokenVault();
        const nextLocale = getInitialDisplayLocale();
        const nextMarket = getInitialDisplayMarket();
        set({
          accessToken: "",
          refreshToken: "",
          userId: "",
          userEmail: "",
          market: nextMarket,
          locale: nextLocale,
          hydrated: true,
          sessionSyncStatus: "synced"
        });
        return;
      }
      access = (await clientSession.getAccessTokenTrimmed()) || "";
    }

    if (!access) {
      set({
        accessToken: "",
        refreshToken: "",
        userId: "",
        userEmail: "",
        hydrated: true,
        sessionSyncStatus: "synced"
      });
      return;
    }

    try {
      const me = await fetchAuthMeValidated();
      const rt = ((await readRefreshTokenFromVault()) || "").trim();
      set({
        accessToken: access,
        refreshToken: rt,
        userId: me.user.userId.trim(),
        userEmail: me.user.email.trim(),
        hydrated: true,
        sessionSyncStatus: "synced"
      });
      const m = me.user.market;
      const l = me.user.locale;
      if (m && l) get().setSessionLocale(m, l);
    } catch (e) {
      if (e instanceof AuthMeFailure && !e.clearVault) {
        window.dispatchEvent(
          new CustomEvent("aics:auth-forbidden", {
            detail: { message: e.message.trim() || null }
          })
        );
      }
      const shouldClear = e instanceof AuthMeFailure && e.clearVault;
      if (shouldClear) await clearTokenVault();
      const nextLocale = getInitialDisplayLocale();
      const nextMarket = getInitialDisplayMarket();
      set({
        accessToken: "",
        refreshToken: "",
        userId: "",
        userEmail: "",
        market: nextMarket,
        locale: nextLocale,
        hydrated: true,
        sessionSyncStatus: "synced"
      });
    }
  },
  setTokens: async (access, refresh, meta) => {
    await persistAccessRefreshTokens(access, refresh);
    let userId = "";
    let userEmail = (meta?.userEmail || "").trim();
    if (access) {
      userId = (meta?.userId || "").trim();
      if (!userId) {
        try {
          const me = await fetchAuthMe();
          userId = me.user.user_id || "";
          if (!userEmail) userEmail = (me.user.email || "").trim();
        } catch {
          /* 与 refresh/login 并发时可由调用方传入 meta.userId */
        }
      }
    } else {
      userEmail = "";
    }
    set({
      accessToken: access,
      refreshToken: refresh,
      userId,
      userEmail: access ? userEmail : "",
      sessionSyncStatus: "synced"
    });
  },
  setSessionLocale: (market, locale) => {
    persistDisplayMarket(market);
    persistDisplayLocale(locale);
    set({ market, locale });
  },
  setSyncStatus: (sessionSyncStatus) => set({ sessionSyncStatus }),
  /**
   * MODULE C-4：清服务端 refresh（尽力）+ vault + 内存会话字段。带路由跳转请用 `performLogoutToLogin`。
   */
  logout: async () => {
    const rt = await readRefreshTokenFromVault();
    await logoutRequest(rt);
    await clearTokenVault();
    const nextLocale = getInitialDisplayLocale();
    const nextMarket = getInitialDisplayMarket();
    set({
      accessToken: "",
      refreshToken: "",
      userId: "",
      userEmail: "",
      market: nextMarket,
      locale: nextLocale,
      sessionSyncStatus: "synced"
    });
  }
}));
