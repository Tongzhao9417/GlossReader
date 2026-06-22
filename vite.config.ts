import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      "/api/deepseek": {
        target: "https://api.deepseek.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/deepseek/, ""),
      },
      "/api/openai": {
        target: "https://api.openai.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/openai/, ""),
      },
      "/api/anthropic": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/anthropic/, ""),
      },
      "/api/gemini": {
        target: "https://generativelanguage.googleapis.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/gemini/, ""),
      },
      "/api/minimax": {
        target: "https://api.minimax.io",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/minimax/, ""),
      },
      "/api/kimi": {
        target: "https://api.moonshot.cn",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/kimi/, ""),
      },
      "/api/mimo": {
        target: "https://api.xiaomimimo.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/mimo/, ""),
      },
      "/api/openrouter": {
        target: "https://openrouter.ai",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/openrouter/, ""),
      },
      "/api/volcengine": {
        target: "https://ark.cn-beijing.volces.com",
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\/volcengine/, ""),
      },
    },
  },
}));
