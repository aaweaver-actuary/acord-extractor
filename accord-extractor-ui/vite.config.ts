import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const devApiTarget = process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:8009";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: devApiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: {
      enabled: false,
    },
  },
});
