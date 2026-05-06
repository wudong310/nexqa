import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/nexqa/",
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
        target: "http://localhost:3456",
        changeOrigin: true,
        ws: true,
      },
      "/nexqa/api": {
        target: "http://localhost:3456",
        changeOrigin: true,
      },
    },
  },
});
