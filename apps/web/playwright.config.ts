import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "unauthenticated",
      testMatch: /(auth-gate|theme-contrast)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] }
      }
    },
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/
    },
    {
      name: "chromium",
      testIgnore: /(auth-gate|theme-contrast)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/demo.json"
      },
      dependencies: ["setup"]
    }
  ],
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
});
