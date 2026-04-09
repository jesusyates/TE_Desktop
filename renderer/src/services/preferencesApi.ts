import { apiClient } from "./apiClient";
import { useAuthStore } from "../store/authStore";

/** C-5 / C-6：与 Web 共用同一 preference 合约；禁止 body 传 user_id。PUT 成功后 bump 由 Core 完成，桌面侧调度后台 refresh。 */
export type UserPreference = {
  user_id: string;
  market: string;
  locale: string;
  updated_at: string | null;
  source: string;
};

export async function getMyPreferences(): Promise<UserPreference> {
  const { data } = await apiClient.get<UserPreference>("/preferences/me");
  return data;
}

export async function updateMyPreferences(market: string, locale: string): Promise<UserPreference> {
  const { data } = await apiClient.put<UserPreference>("/preferences/me", { market, locale });
  useAuthStore.getState().setSessionLocale(data.market, data.locale);
  return data;
}
