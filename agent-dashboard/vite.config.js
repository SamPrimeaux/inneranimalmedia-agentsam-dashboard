import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/static/dashboard/agent/",
  build: {
    outDir: "dist",
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
