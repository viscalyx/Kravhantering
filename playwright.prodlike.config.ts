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
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001'

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

const testTimeoutMs = readTimeout('PLAYWRIGHT_TEST_TIMEOUT', 60_000)
const expectTimeoutMs = readTimeout('PLAYWRIGHT_EXPECT_TIMEOUT', 15_000)
const actionTimeoutMs = readTimeout('PLAYWRIGHT_ACTION_TIMEOUT', 15_000)
const navigationTimeoutMs = readTimeout('PLAYWRIGHT_NAVIGATION_TIMEOUT', 15_000)

/**
 * Derive a canonical origin from `baseUrl` so a trailing slash or path on
 * `PLAYWRIGHT_BASE_URL` cannot leak into the `Origin` header and trigger
 * spurious CSRF rejections in `lib/auth/csrf.ts`.
 */
function deriveOrigin(input: string): string {
  try {
    return new URL(input).origin
  } catch {
    return 'http://localhost:3001'
  }
}
const originHeader = deriveOrigin(baseUrl)

export default defineConfig({
  testDir: './tests/integration',
  // Developer Mode is aliased to no-op entrypoints in non-dev builds (see
  // `enableDeveloperMode` in next.config.ts), so the overlay badge/chip/toast
  // surfaces those specs assert on are intentionally absent in prodlike. Skip
  // the spec here instead of forcing ENABLE_DEVELOPER_MODE=true on the
  // prodlike build, which is meant to mirror real production.
  testIgnore: ['**/developer-mode-overlay.spec.ts'],
  globalSetup: './tests/integration/global-setup.ts',
  outputDir: 'test-results/prodlike',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /* Keep integration tests serialized to avoid overwhelming shared services */
  workers: 1,
  timeout: testTimeoutMs,
  expect: { timeout: expectTimeoutMs },
  reporter: [
    ['html', { outputFolder: 'playwright-report-prodlike', open: 'never' }],
    ['junit', { outputFile: 'test-results/prodlike/playwright-junit.xml' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',

    /*
     * Same-origin / CSRF defenses (`lib/auth/csrf.ts`) reject mutating
     * requests that lack matching `Origin` and `X-Requested-With:
     * XMLHttpRequest`. Set them on every `request`-fixture call so specs
     * don't have to remember; they are no-ops on safe (GET/HEAD) methods.
     */
    extraHTTPHeaders: {
      Origin: originHeader,
      'X-Requested-With': 'XMLHttpRequest',
    },

    storageState: 'test-results/auth/admin.json',

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
          // Auth is always on. Boot the prodlike server normally and let the
          // global setup (`tests/integration/global-setup.ts`) acquire a real
          // Keycloak session per role. Make sure `npm run idp:up` is running.
          command: 'bash -lc "npm run start:prodlike"',
          url: 'http://localhost:3001',
          timeout: 300_000,
          reuseExistingServer: !process.env.CI,
          env: {
            ...process.env,
            ENABLE_ERROR_BOUNDARY_TEST_ROUTE: '1',
            NODE_ENV: 'production',
          },
        },
      ],
})
