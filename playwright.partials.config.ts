import { defineConfig } from "@playwright/test";

import { partialOrigin } from "./e2e/partials-accounts";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "partials.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  outputDir: "test-results/partials",
  reporter: [["list"]],
  webServer: {
    command: "bun e2e/partials-prepare.ts && bun --bun next dev --port 3471",
    url: `${partialOrigin}/sign-in`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: "sqlite:/tmp/smart-assets-partials/app.db",
      BETTER_AUTH_SECRET: "partials-secret-not-a-portal-password",
      BETTER_AUTH_URL: partialOrigin,
      BETTER_AUTH_TRUSTED_ORIGINS: partialOrigin,
    },
  },
  use: {
    baseURL: partialOrigin,
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
