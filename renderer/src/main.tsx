import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { logAuthRuntimeBaseline } from "./config/runtimeEndpoints";
import { useAuthStore } from "./store/authStore";
import { initTheme } from "./theme/aicsTheme";
import "./styles.css";

logAuthRuntimeBaseline();
initTheme();

/** 与会话恢复并行挂载 UI；首帧由 RequireAuth / 登录前路由承担，避免整页空白等待 hydrate */
void useAuthStore.getState().hydrate();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
