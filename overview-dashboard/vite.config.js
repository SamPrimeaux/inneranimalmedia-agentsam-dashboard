import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/static/dashboard/overview/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "src/main.jsx",
        finance: "src/finance-entry.jsx",
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "finance" ? "Finance.js" : "overview-dashboard.js"),
        chunkFileNames: "overview-dashboard-[name].js",
        assetFileNames: "overview-dashboard[extname]",
      },
    },
  },
});
