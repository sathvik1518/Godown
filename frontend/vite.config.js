import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the browser calls /api/..., and Vite forwards it to the FastAPI server
// on port 8000 (removing the /api prefix). On Vercel, /api is handled by api/index.py.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: { chunkSizeWarningLimit: 700 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false,
  },
});
