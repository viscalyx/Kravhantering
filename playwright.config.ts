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
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

/**
 * Same-origin / CSRF defenses (`lib/auth/csrf.ts`) compare the inbound
 * `Origin` header against the canonical request origin. Derive a canonical
 * origin string from `baseUrl` so a trailing slash or path on
 * `PLAYWRIGHT_BASE_URL` cannot leak into the header and cause spurious
 * CSRF rejections.
 */
function deriveOrigin(input: string): string {
  try {
    return new URL(input).origin
  } catch {
    return 'http://localhost:3000'
  }
}
const originHeader = deriveOrigin(baseUrl)

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
     * Use `localhost` (not `127.0.0.1`) so the host matches the OIDC
     * redirect URI registered in Keycloak (`AUTH_OIDC_REDIRECT_URI=
     * http://localhost:3000/api/auth/callback`). Cookies are host-scoped:
     * the iron-session cookie established by global-setup must be sent on
     * every navigation, which only works when both share the same host.
     */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',

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

    actionTimeout: actionTimeoutMs,
    navigationTimeout: navigationTimeoutMs,

    /*
     * Auth is mandatory in every build target. Each integration spec runs
     * with the `admin` Keycloak session seeded by `tests/integration/global-
     * setup.ts`. Specs that need a different role can override via
     * `test.use({ storageState: 'test-results/auth/<role>.json' })`.
     */
    storageState: 'test-results/auth/admin.json',

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
          // Auth is always on. Boot the dev server and let the global setup
          // (`tests/integration/global-setup.ts`) acquire a real Keycloak
          // session per role. Make sure `npm run idp:up` is running.
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            NODE_ENV: 'development',
          },
        },
      ],
})
