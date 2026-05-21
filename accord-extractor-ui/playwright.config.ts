import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

const backendHost = process.env.PW_BACKEND_HOST ?? "127.0.0.1";
const backendPort = Number(process.env.PW_BACKEND_PORT ?? "8009");
const frontendHost = process.env.PW_FRONTEND_HOST ?? "127.0.0.1";
const frontendPort = Number(process.env.PW_FRONTEND_PORT ?? "4173");
const apiBaseUrl =
  process.env.PW_API_BASE_URL ?? `http://${backendHost}:${backendPort}`;
const frontendBaseUrl = `http://${frontendHost}:${frontendPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: frontendBaseUrl,
    trace: "on-first-retry",
    viewport: { width: 1440, height: 1100 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `cd .. && uv run acord-extractor serve-api --host ${backendHost} --port ${backendPort}`,
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --host ${frontendHost} --port ${frontendPort}`,
      env: {
        ...process.env,
        VITE_API_BASE_URL: "/api",
        VITE_DEV_API_TARGET: apiBaseUrl,
      },
      url: frontendBaseUrl,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
