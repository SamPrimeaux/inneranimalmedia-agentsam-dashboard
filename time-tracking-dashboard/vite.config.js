import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/static/dashboard/time-tracking/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: "src/main.jsx",
      output: {
        entryFileNames: "time-tracking-dashboard.js",
        chunkFileNames: "time-tracking-dashboard-[name].js",
        assetFileNames: "time-tracking-dashboard[extname]",
      },
    },
  },
});
