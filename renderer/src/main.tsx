import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import { useAuthStore } from "./store/authStore";
import { initTheme } from "./theme/aicsTheme";
import "./styles.css";

initTheme();

void useAuthStore.getState().hydrate().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  );
});
