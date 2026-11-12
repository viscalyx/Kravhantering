import type { TestInfo } from '@playwright/test'

interface ResolveIntegrationBaseUrlOptions {
  fallback?: string
  stripTrailingSlash?: boolean
}

export function resolveIntegrationBaseUrl(
  testInfo: TestInfo,
  options: ResolveIntegrationBaseUrlOptions = {},
): string {
  const baseUrl = String(
    testInfo.project.use.baseURL ??
      process.env.PLAYWRIGHT_BASE_URL ??
      options.fallback ??
      'http://localhost:3000',
  )

  return options.stripTrailingSlash ? baseUrl.replace(/\/$/, '') : baseUrl
}
