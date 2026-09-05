import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'line',
  outputDir: 'tmp/playwright-results',
  use: {
    baseURL,
    browserName: 'chromium',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 3100',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      WISHLIST_DATA_SOURCE: 'fixture',
      STEAM_FINANCIAL_API_KEY: '',
      STEAM_APP_ID: '',
    },
  },
  projects: [
    {
      name: 'browser-flow',
      testMatch: /acceptance\.spec\.ts/,
      use: { serviceWorkers: 'block' },
    },
    {
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: { serviceWorkers: 'allow' },
    },
  ],
});
