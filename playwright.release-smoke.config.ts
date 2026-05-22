import { defineConfig, devices } from '@playwright/test'

const desktopChromium = {
  ...devices['Desktop Chrome'],
  browserName: 'chromium' as const,
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
  viewport: { width: 1440, height: 1200 },
}

const readTimeout = (envVar: string, fallbackMs: number): number => {
  const raw = process.env[envVar]
  if (!raw) return fallbackMs
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs
}

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'https://kravhantering.test'
const testTimeoutMs = readTimeout('PLAYWRIGHT_TEST_TIMEOUT', 60_000)
const expectTimeoutMs = readTimeout('PLAYWRIGHT_EXPECT_TIMEOUT', 15_000)
const actionTimeoutMs = readTimeout('PLAYWRIGHT_ACTION_TIMEOUT', 15_000)
const navigationTimeoutMs = readTimeout('PLAYWRIGHT_NAVIGATION_TIMEOUT', 15_000)

function deriveOrigin(input: string): string {
  try {
    return new URL(input).origin
  } catch {
    return 'https://kravhantering.test'
  }
}

const originHeader = deriveOrigin(baseUrl)

export default defineConfig({
  testDir: './tests/release-smoke',
  globalSetup: './tests/release-smoke/global-setup.ts',
  outputDir: 'test-results/release-smoke',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: testTimeoutMs,
  expect: { timeout: expectTimeoutMs },
  reporter: [
    [
      'html',
      { outputFolder: 'playwright-report-release-smoke', open: 'never' },
    ],
    [
      'junit',
      { outputFile: 'test-results/release-smoke/playwright-junit.xml' },
    ],
    ['list'],
  ],
  use: {
    baseURL: baseUrl,
    extraHTTPHeaders: {
      Origin: originHeader,
      'X-Requested-With': 'XMLHttpRequest',
    },
    storageState: 'test-results/release-smoke/auth/release-smoke-user.json',
    actionTimeout: actionTimeoutMs,
    navigationTimeout: navigationTimeoutMs,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: desktopChromium,
    },
  ],
  webServer: undefined,
})
