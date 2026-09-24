import { defineConfig, devices } from "@playwright/test";

// Runs against the dev servers from `npm run dev` (demo :5173, checkout :5174).
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5173", headless: true },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"] } },
  ],
  workers: 1,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5174/sdk/v1.js",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
