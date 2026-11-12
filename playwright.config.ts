import { defineConfig, devices } from '@playwright/test';

/**
 * E2E coverage runs at realistic mobile and desktop viewports.
 * The app is served from the production build under the /french-daily/ base
 * path — the same artifact GitHub Pages serves.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4173/french-daily/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-s',
      use: { ...devices['iPhone 12'], browserName: 'chromium', viewport: { width: 375, height: 812 } },
    },
    {
      name: 'mobile-l',
      use: { ...devices['iPhone 12'], browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium', viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run build:web && npm run preview',
    url: 'http://localhost:4173/french-daily/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
