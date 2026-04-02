import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import monacoEditorPluginModule from "vite-plugin-monaco-editor";
import { fixXtermBrowserTdz } from "./vite-plugin-fix-xterm-browser-tdz.js";

const monacoEditorPlugin =
  typeof monacoEditorPluginModule === "function"
    ? monacoEditorPluginModule
    : monacoEditorPluginModule.default;

/** Set `VITE_AGENT_DASHBOARD_DEBUG=1` for unminified `dist-debug/` + sourcemaps (TDZ / init-order debugging). */
const debug = process.env.VITE_AGENT_DASHBOARD_DEBUG === "1";

/** When set (e.g. by scripts/e2e-overnight.sh), production build emits asset URLs for TOOLS preview uploads. Default matches worker/R2 dashboard path. */
const viteBase = process.env.E2E_TOOLS_VITE_BASE || "/static/dashboard/agent/";

export default defineConfig({
  base: viteBase,
  plugins: [
    fixXtermBrowserTdz(),
    monacoEditorPlugin({
      languageWorkers: [
        "editorWorkerService",
        "typescript",
        "json",
        "html",
        "css",
      ],
    }),
    react(),
  ],
  build: {
    minify: debug ? false : "esbuild",
    sourcemap: debug,
    outDir: debug ? "dist-debug" : "dist",
    rollupOptions: {
      input: "src/main.jsx",
      output: {
        entryFileNames: "agent-dashboard.js",
        chunkFileNames: "agent-dashboard-[name].js",
        assetFileNames: "agent-dashboard[extname]",
      },
    },
  },
});
