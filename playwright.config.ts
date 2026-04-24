import { defineConfig, devices } from '@playwright/test'

const desktopChromium = {
  ...devices['Desktop Chrome'],
  browserName: 'chromium' as const,
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
  viewport: { width: 1440, height: 1200 },
}

/**
 * Parse a millisecond timeout from an environment variable. Falls back to the
 * provided default when the variable is unset or not a positive integer.
 */
const readTimeout = (envVar: string, fallbackMs: number): number => {
  const raw = process.env[envVar]
  if (!raw) return fallbackMs
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs
}

/*
 * Default timeouts are generous enough for Next.js dev-mode on-demand
 * compilation on slower hosts (e.g. Docker Desktop on Windows where the WSL/9P
 * bind-mount makes first-hit route compilation take several seconds). Each
 * value can be overridden per-run via env vars without code changes.
 */
const testTimeoutMs = readTimeout('PLAYWRIGHT_TEST_TIMEOUT', 60_000)
const expectTimeoutMs = readTimeout('PLAYWRIGHT_EXPECT_TIMEOUT', 15_000)
const actionTimeoutMs = readTimeout('PLAYWRIGHT_ACTION_TIMEOUT', 15_000)
const navigationTimeoutMs = readTimeout('PLAYWRIGHT_NAVIGATION_TIMEOUT', 15_000)

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
  timeout: testTimeoutMs,
  expect: { timeout: expectTimeoutMs },
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

    actionTimeout: actionTimeoutMs,
    navigationTimeout: navigationTimeoutMs,

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
          // Integration tests run with auth disabled. They cover product
          // behaviour (developer mode, navigation, requirements UI), not the
          // auth flow itself — that is exercised by dedicated unit tests in
          // `tests/unit/auth-*.test.ts` against an in-process oidc-provider
          // mock (`tests/support/oidc-mock.ts`). Running them under
          // AUTH_ENABLED=true would just bounce every navigation through the
          // real Keycloak login page and hang.
          command: 'npm run dev:noauth',
          url: 'http://127.0.0.1:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            NODE_ENV: 'development',
          },
        },
      ],
})
