import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fixXtermBrowserTdz } from "./vite-plugin-fix-xterm-browser-tdz.js";

/** Set `VITE_AGENT_DASHBOARD_DEBUG=1` for unminified `dist-debug/` + sourcemaps (TDZ / init-order debugging). */
const debug = process.env.VITE_AGENT_DASHBOARD_DEBUG === "1";

export default defineConfig({
  plugins: [fixXtermBrowserTdz(), react()],
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
