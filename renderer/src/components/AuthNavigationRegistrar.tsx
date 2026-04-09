import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  registerAuthGlobalNavigate,
  unregisterAuthGlobalNavigate
} from "../services/authSessionInvalidation";

/** MODULE C-6：为 apiClient 401 拦截器注册 HashRouter navigate。 */
export function AuthNavigationRegistrar() {
  const navigate = useNavigate();
  useEffect(() => {
    registerAuthGlobalNavigate((path, opts) => navigate(path, { replace: true, ...opts }));
    return () => unregisterAuthGlobalNavigate();
  }, [navigate]);
  return null;
}
