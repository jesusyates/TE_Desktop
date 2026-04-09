import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const aicsDebug = process.env.AICS_DEBUG_CONTEXT ?? "";
const aicsApiTimeout = process.env.AICS_API_TIMEOUT_MS ?? "300000";
const viteSharedCoreBase =
  process.env.VITE_SHARED_CORE_BASE_URL ?? process.env.AICS_SHARED_CORE_BASE_URL ?? "";
const viteAiGatewayBase =
  process.env.VITE_AI_GATEWAY_BASE_URL ?? process.env.AICS_AI_GATEWAY_BASE_URL ?? "";

export default defineConfig({
  root: __dirname,
  /** D-7-5M：打包后 Electron loadFile(file://) 须用相对资源路径，否则 /assets/* 解析失败导致白屏 */
  base: "./",
  define: {
    "import.meta.env.AICS_DEBUG_CONTEXT": JSON.stringify(aicsDebug),
    "import.meta.env.AICS_API_TIMEOUT_MS": JSON.stringify(aicsApiTimeout),
    "import.meta.env.VITE_SHARED_CORE_BASE_URL": JSON.stringify(viteSharedCoreBase),
    "import.meta.env.VITE_AI_GATEWAY_BASE_URL": JSON.stringify(viteAiGatewayBase)
  },
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
