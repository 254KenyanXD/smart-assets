import { defineConfig } from "@playwright/test";

/**
 * Playwright runs against the dev server that is already listening on port 3000.
 * It never starts one: 127.0.0.1 answers 403, so the origin is localhost.
 * Chromium is the system package at /usr/bin/chromium; no browser download.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
});
