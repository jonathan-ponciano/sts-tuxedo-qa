import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const proxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: proxyTarget, changeOrigin: true },
      "/mcp": { target: proxyTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
  },
});
