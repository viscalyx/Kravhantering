import { defineConfig, devices } from '@playwright/test'

const desktopChromium = {
  browserName: 'chromium' as const,
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
  viewport: devices['Desktop Chrome'].viewport,
}

/**
 * Playwright configuration for integration tests against the dev server.
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/integration',
  globalSetup: './tests/integration/global-setup.ts',
  outputDir: 'test-results/dev',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /* Limit workers to avoid overwhelming the Next.js dev server */
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ['html', { outputFolder: 'playwright-report-dev', open: 'never' }],
    ['junit', { outputFile: 'test-results/dev/playwright-junit.xml' }],
    ['list'],
  ],
  use: {
    /*
     * Use 127.0.0.1 instead of localhost — WebKit on Linux cannot reliably
     * resolve localhost in containers / dev-containers.
     */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
          url: 'http://127.0.0.1:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            NODE_ENV: 'development',
          },
        },
      ],
})
