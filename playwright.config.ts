import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3005',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      'x-forwarded-host': '127.0.0.1:3005',
      'x-forwarded-proto': 'http',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
