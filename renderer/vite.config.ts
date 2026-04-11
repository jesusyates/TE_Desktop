import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const aicsDebug = process.env.AICS_DEBUG_CONTEXT ?? "";
const aicsApiTimeout = process.env.AICS_API_TIMEOUT_MS ?? "300000";
const viteApiBase = process.env.VITE_API_BASE_URL ?? process.env.AICS_API_BASE_URL ?? "";
const viteSharedCoreBase =
  process.env.VITE_SHARED_CORE_BASE_URL ?? process.env.AICS_SHARED_CORE_BASE_URL ?? "";
const viteAiGatewayBase =
  process.env.VITE_AI_GATEWAY_BASE_URL ?? process.env.AICS_AI_GATEWAY_BASE_URL ?? "";
const viteBackendProfile =
  process.env.VITE_AICS_BACKEND_PROFILE ?? process.env.AICS_BACKEND_PROFILE ?? "";

/**
 * 仅当 **进程环境变量非空** 时注入 define，避免 `""` 覆盖 `renderer/.env*`在构建时注入的值。
 */
const define: Record<string, string> = {
  "import.meta.env.AICS_DEBUG_CONTEXT": JSON.stringify(aicsDebug),
  "import.meta.env.AICS_API_TIMEOUT_MS": JSON.stringify(aicsApiTimeout),
  "import.meta.env.VITE_AICS_BACKEND_PROFILE": JSON.stringify(viteBackendProfile)
};
if (viteApiBase.trim()) {
  define["import.meta.env.VITE_API_BASE_URL"] = JSON.stringify(viteApiBase.trim().replace(/\/+$/, ""));
}
if (viteSharedCoreBase.trim()) {
  define["import.meta.env.VITE_SHARED_CORE_BASE_URL"] = JSON.stringify(
    viteSharedCoreBase.trim().replace(/\/+$/, "")
  );
}
if (viteAiGatewayBase.trim()) {
  define["import.meta.env.VITE_AI_GATEWAY_BASE_URL"] = JSON.stringify(
    viteAiGatewayBase.trim().replace(/\/+$/, "")
  );
}

export default defineConfig({
  root: __dirname,
  /** D-7-5M：打包后 Electron loadFile(file://) 须用相对资源路径，否则 /assets/* 解析失败导致白屏 */
  base: "./",
  define,
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared/content-hash-spec": path.resolve(__dirname, "../shared/contentHashSpec.ts")
    }
  }
});
