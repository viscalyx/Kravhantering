import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for integration tests against the preview server.
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/integration',
  globalSetup: './tests/integration/global-setup.ts',
  outputDir: 'test-results/preview',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ['html', { outputFolder: 'playwright-report-preview', open: 'never' }],
    ['junit', { outputFile: 'test-results/preview/playwright-junit.xml' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8787',

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      /* Cross-origin warning tests only apply to the dev server. */
      testIgnore: /cross-origin-warning/,
    },
  ],

  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command:
            'bash -c \'set -o pipefail && npm run preview 2>&1 | grep -v "kj/async-io-unix\\|Broken pipe\\|Connection reset by peer\\|workerd@"\'',
          url: 'http://127.0.0.1:8787',
          timeout: 300_000,
          reuseExistingServer: !process.env.CI,
          env: {
            NODE_ENV: 'production',
          },
        },
      ],
})
