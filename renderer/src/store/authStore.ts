import { create } from "zustand";
import { AuthMeFailure, fetchAuthMeValidated, logoutRequest, type AuthMeSuccessBody } from "../services/authApi";
import {
  defaultMarketForLocale,
  getInitialDisplayLocale,
  getInitialDisplayMarket,
  isDisplayLocaleUserLocked,
  normalizeUiLocale,
  persistDisplayLocale,
  persistDisplayMarket,
  setDisplayLocaleUserLocked
} from "../services/displayLocale";
import {
  clearTokenVault,
  clientSession,
  persistAccessRefreshTokens,
  readRefreshTokenFromVault
} from "../services/clientSession";

export type SessionSyncStatus = "synced" | "refresh_pending";

/** 账户页「基础身份」快照（由 /v1/auth/me 填充，登录态内复用） */
export type AccountProfileSnapshot = {
  userId: string;
  email: string;
  market: string;
  locale: string;
  product?: string;
  client_platform?: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt?: string;
};

/** 配额 / 套餐等易变信息（后台静默刷新） */
export type AccountBillingEntitlement = {
  user_id: string;
  product: string;
  plan: string;
  quota: number;
  used: number;
  status: string;
};

const ACCOUNT_DATA_STALE_MS = 5 * 60 * 1000;

function emptyAccountPageCache() {
  return {
    accountProfileSnapshot: null as AccountProfileSnapshot | null,
    accountProfileFetchedAt: 0,
    accountEntitlement: null as AccountBillingEntitlement | null,
    accountEntitlementFetchedAt: 0,
    accountPageRevalidating: false
  };
}

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
  /** 最近一次验证后的 /me 快照与时间戳（ms）；用于账户页秒开 */
  accountProfileSnapshot: AccountProfileSnapshot | null;
  accountProfileFetchedAt: number;
  accountEntitlement: AccountBillingEntitlement | null;
  accountEntitlementFetchedAt: number;
  /** 账户页后台拉取 /me 或 entitlement 时轻量 UI用 */
  accountPageRevalidating: boolean;
  /** MODULE C-3：冷启动读 vault → /auth/me 校验后再置 true */
  hydrate: () => Promise<void>;
  /** 将 /v1/auth/me 成功体合并进会话与账户快照 */
  mergeAuthMeSuccess: (me: AuthMeSuccessBody) => void;
  /** 账户页：store 优先，必要时静默拉取；`force` 跳过新鲜度窗口 */
  revalidateAccountPageData: (options?: { force?: boolean }) => Promise<void>;
  setTokens: (
    access: string,
    refresh: string,
    meta?: { userId?: string; userEmail?: string }
  ) => Promise<void>;
  setSessionLocale: (
    market: string,
    locale: string,
    options?: { fromUserPicker?: boolean }
  ) => void;
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
  accountProfileSnapshot: null,
  accountProfileFetchedAt: 0,
  accountEntitlement: null,
  accountEntitlementFetchedAt: 0,
  accountPageRevalidating: false,

  mergeAuthMeSuccess: (me) => {
    const u = me.user;
    const uid = u.userId.trim();
    const email = u.email.trim();
    const cur = get();
    const mkt = (u.market ?? cur.market).trim() || cur.market;
    const loc = (u.locale ?? cur.locale).trim() || cur.locale;
    set({
      userId: uid,
      userEmail: email,
      accountProfileSnapshot: {
        userId: uid,
        email,
        market: mkt,
        locale: loc,
        product: u.product,
        client_platform: u.client_platform,
        displayName: u.displayName?.trim() || undefined,
        avatarUrl: u.avatarUrl?.trim() || undefined,
        createdAt: u.createdAt?.trim() || undefined
      },
      accountProfileFetchedAt: Date.now()
    });
  },

  revalidateAccountPageData: async (options) => {
    const force = options?.force === true;
    const st = get();
    if (!st.accessToken.trim() || !st.userId.trim()) return;

    const now = Date.now();
    const profileStale =
      force ||
      !st.accountProfileSnapshot ||
      st.accountProfileSnapshot.userId !== st.userId ||
      now - st.accountProfileFetchedAt >= ACCOUNT_DATA_STALE_MS;
    const entStale =
      force ||
      !st.accountEntitlement ||
      now - st.accountEntitlementFetchedAt >= ACCOUNT_DATA_STALE_MS;

    if (!profileStale && !entStale) return;

    set({ accountPageRevalidating: true });
    try {
      const tasks: Promise<void>[] = [];
      if (profileStale) {
        tasks.push(
          (async () => {
            try {
              const me = await fetchAuthMeValidated();
              get().mergeAuthMeSuccess(me);
              const m = me.user.market;
              const l = me.user.locale;
              if (m && l && !isDisplayLocaleUserLocked()) {
                get().setSessionLocale(m, l);
              }
            } catch {
              /* 保留已有快照与界面 */
            }
          })()
        );
      }
      if (entStale) {
        tasks.push(
          (async () => {
            try {
              const { apiClient } = await import("../services/apiClient");
              const r = await apiClient.get<AccountBillingEntitlement>("/billing/entitlement");
              set({
                accountEntitlement: r.data,
                accountEntitlementFetchedAt: Date.now()
              });
            } catch {
              /* 保留已有 entitlement */
            }
          })()
        );
      }
      await Promise.all(tasks);
    } finally {
      set({ accountPageRevalidating: false });
    }
  },

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
          sessionSyncStatus: "synced",
          ...emptyAccountPageCache()
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
        sessionSyncStatus: "synced",
        ...emptyAccountPageCache()
      });
      return;
    }

    try {
      const me = await fetchAuthMeValidated();
      const rt = ((await readRefreshTokenFromVault()) || "").trim();
      get().mergeAuthMeSuccess(me);
      set({
        accessToken: access,
        refreshToken: rt,
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
        sessionSyncStatus: "synced",
        ...emptyAccountPageCache()
      });
    }
  },
  setTokens: async (access, refresh, meta) => {
    await persistAccessRefreshTokens(access, refresh);
    if (!access) {
      set({
        accessToken: "",
        refreshToken: "",
        userId: "",
        userEmail: "",
        sessionSyncStatus: "synced",
        ...emptyAccountPageCache()
      });
      return;
    }

    let userId = (meta?.userId || "").trim();
    let userEmail = (meta?.userEmail || "").trim();

    if (!userId) {
      try {
        const me = await fetchAuthMeValidated();
        get().mergeAuthMeSuccess(me);
        userId = me.user.userId.trim();
        if (!userEmail) userEmail = me.user.email.trim();
      } catch {
        /* 与 refresh/login 并发时可由调用方传入 meta.userId */
      }
    } else {
      void fetchAuthMeValidated()
        .then((me) => {
          get().mergeAuthMeSuccess(me);
          const m = me.user.market;
          const l = me.user.locale;
          if (m && l && !isDisplayLocaleUserLocked()) {
            get().setSessionLocale(m, l);
          }
        })
        .catch(() => {});
    }

    set({
      accessToken: access,
      refreshToken: refresh,
      userId,
      userEmail,
      sessionSyncStatus: "synced"
    });
  },
  setSessionLocale: (market, locale, options) => {
    const loc = normalizeUiLocale(locale) ?? getInitialDisplayLocale();
    const mkt =
      String(market ?? "")
        .trim()
        .toLowerCase() || defaultMarketForLocale(loc);
    persistDisplayMarket(mkt);
    persistDisplayLocale(loc);
    if (options?.fromUserPicker) setDisplayLocaleUserLocked(true);
    set({ market: mkt, locale: loc });
    const snap = get().accountProfileSnapshot;
    if (snap && snap.userId === get().userId) {
      set({
        accountProfileSnapshot: { ...snap, market: mkt, locale: loc }
      });
    }
  },
  setSyncStatus: (sessionSyncStatus) => set({ sessionSyncStatus }),
  /**
   * MODULE C-4：清服务端 refresh（尽力）+ vault + 内存会话字段。桌面端登出 UI 请用 `performLogoutAndQuitApp` / `invalidateAuthenticatedSessionAndGoLogin`（当前为退出应用后再冷启动登录）。
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
      sessionSyncStatus: "synced",
      ...emptyAccountPageCache()
    });
  }
}));
