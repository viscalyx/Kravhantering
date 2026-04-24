import { defineConfig, devices } from '@playwright/test'

const desktopChromium = {
  browserName: 'chromium' as const,
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
  viewport: devices['Desktop Chrome'].viewport,
}

/**
 * Playwright configuration for integration tests against the built app.
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/integration',
  globalSetup: './tests/integration/global-setup.ts',
  outputDir: 'test-results/prodlike',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ['html', { outputFolder: 'playwright-report-prodlike', open: 'never' }],
    ['junit', { outputFile: 'test-results/prodlike/playwright-junit.xml' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001',

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
          // Same rationale as playwright.config.ts: integration tests run
          // with auth disabled. The `:noauth` variant builds and runs the
          // prod-like server with AUTH_ENABLED=false; because boot validation
          // refuses that combination under NODE_ENV=production, the script
          // also sets the opt-in escape hatch
          // AUTH_ALLOW_DISABLE_IN_PRODUCTION=true. Never use that flag in a
          // real deployment.
          command: 'bash -lc "npm run start:prodlike:noauth"',
          url: 'http://127.0.0.1:3001',
          timeout: 300_000,
          reuseExistingServer: !process.env.CI,
          env: {
            ...process.env,
            NODE_ENV: 'production',
          },
        },
      ],
})
