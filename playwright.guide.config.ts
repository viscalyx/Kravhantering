import { defineConfig, devices } from '@playwright/test'

const desktopChromium = {
  ...devices['Desktop Chrome'],
  browserName: 'chromium' as const,
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
}

/**
 * Playwright configuration for generating the user guide.
 *
 * Run with: npm run generate-guide
 *
 * Outputs:
 *   docs/guide/README.md   — generated markdown guide
 *   docs/guide/images/     — screenshots
 *
 * NOTE: This is a one-shot guide generator, not a repeatable test suite.
 * It mutates the database (creates requirements, deviations, suggestions).
 * Run `npm run db:setup` to reset the database to seed state afterwards if needed.
 */
export default defineConfig({
  testDir: './tests/guide',
  outputDir: 'test-results/guide',
  globalSetup: './tests/integration/global-setup.ts',
  // The guide is a single long-running script — allow 10 minutes
  timeout: 10 * 60 * 1_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report-guide', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    storageState: 'test-results/auth/admin.json',
    trace: 'retain-on-failure',
    screenshot: 'on',
    viewport: { width: 1440, height: 1200 },
  },
  projects: [
    {
      name: 'chromium',
      use: desktopChromium,
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 120_000,
          env: {
            NODE_ENV: 'development',
          },
        },
      ],
})
