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

export default defineConfig({
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
  base: "/static/dashboard/agent/",
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
