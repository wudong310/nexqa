import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const base = process.env.VITE_BASE || '/nexqa/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/nexqa/api/openclaw/ws-proxy": {
        target: "http://localhost:18301",
        changeOrigin: true,
        ws: true,
      },
      "/nexqa/api": {
        target: "http://localhost:18301",
        changeOrigin: true,
      },
    },
  },
});
