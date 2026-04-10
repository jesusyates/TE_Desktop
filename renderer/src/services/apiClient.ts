import axios, { type AxiosInstance, isAxiosError } from "axios";
import { AI_GATEWAY_BASE_URL, SHARED_CORE_BASE_URL } from "../config/runtimeEndpoints";
import { CLIENT_VERSION } from "../config/clientVersion";
import { clientSession } from "./clientSession";
import { getCoreRequestHeaders } from "./coreRequestContext";
import { isAuth401ResponseExempt } from "./authHttpPolicy";
import { tryRefreshSession } from "./authSilentRefresh";
import { invalidateAuthenticatedSessionAndGoLogin } from "./authSessionInvalidation";
import { toUserFacingErrorMessage } from "./userFacingErrorMessage";
import { logAxiosFailure } from "./apiErrorLog";

const parsedTimeout = Number(import.meta.env.AICS_API_TIMEOUT_MS);
const apiTimeoutMs =
  Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 300000;

function attachStandardRequestInterceptor(
  instance: AxiosInstance,
  options: { attachCoreGatewayIdentity: boolean }
): void {
  instance.interceptors.request.use(async (config) => {
    const token = await clientSession.getAccessTokenTrimmed();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }
    const market = await clientSession.getMarket();
    const locale = await clientSession.getLocale();
    config.headers["X-Client-Platform"] = "desktop";
    config.headers["X-Client-Market"] = market;
    config.headers["X-Client-Locale"] = locale;
    config.headers["X-Client-Preference-Market"] = market;
    config.headers["X-Client-Preference-Locale"] = locale;
    config.headers["X-Client-Version"] = CLIENT_VERSION;
    config.headers["X-Client-Product"] = "aics";
    if (options.attachCoreGatewayIdentity) {
      const idHeaders = getCoreRequestHeaders();
      Object.assign(config.headers as Record<string, string>, idHeaders);
    }
    return config;
  });
}

const AUTH_SILENT_RETRY = "__aicsSilentAuthRetry";

function attachAuthResponseInterceptor(instance: AxiosInstance): void {
  instance.interceptors.response.use(
    (res) => res,
    async (error) => {
      if (!isAxiosError(error)) return Promise.reject(error);
      logAxiosFailure("shared-core", error);
      const cfg = error.config;
      const url = typeof cfg?.url === "string" ? cfg.url : "";
      if (isAuth401ResponseExempt(url)) return Promise.reject(error);

      const status = error.response?.status;
      if (error.response == null) {
        return Promise.reject(error);
      }

      if (status === 403) {
        let msg = "";
        const data = error.response.data;
        if (data && typeof data === "object" && "message" in data) {
          msg = String((data as { message: unknown }).message).trim();
        }
        const friendly = msg ? toUserFacingErrorMessage(msg) : "";
        window.dispatchEvent(
          new CustomEvent("aics:auth-forbidden", {
            detail: { message: friendly || null }
          })
        );
        return Promise.reject(error);
      }

      if (status === 401) {
        if (!cfg) {
          void invalidateAuthenticatedSessionAndGoLogin();
          return Promise.reject(error);
        }
        const flags = cfg as { [AUTH_SILENT_RETRY]?: boolean };
        if (flags[AUTH_SILENT_RETRY]) {
          void invalidateAuthenticatedSessionAndGoLogin();
          return Promise.reject(error);
        }
        const ok = await tryRefreshSession();
        if (!ok) {
          void invalidateAuthenticatedSessionAndGoLogin();
          return Promise.reject(error);
        }
        flags[AUTH_SILENT_RETRY] = true;
        return instance.request(cfg);
      }

      return Promise.reject(error);
    }
  );
}

function createHttpClient(baseURL: string, attachCoreGatewayIdentity: boolean): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: apiTimeoutMs
  });
  attachStandardRequestInterceptor(instance, { attachCoreGatewayIdentity });
  attachAuthResponseInterceptor(instance);
  return instance;
}

/**
 * Shared Core（账户、偏好、AICS Domain API 等）。Auth v1 Step 3：401 时单次静默 refresh 后重放原请求，失败则清会话并回登录。
 */
export const apiClient = createHttpClient(SHARED_CORE_BASE_URL, false);

/**
 * AI 网关（analyze / plan / safety / result / memory / audit / usage 等）。自动附带与 apiClient 一致的客户端头 + Core 身份头。
 */
export const aiGatewayClient = createHttpClient(AI_GATEWAY_BASE_URL, true);
