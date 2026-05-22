import type { FullConfig } from '@playwright/test'
import {
  getPlaywrightBaseUrl,
  loginAndSaveStorageState,
  type RoleSpec,
} from '@/tests/support/playwright-auth'

export const RELEASE_SMOKE_USER: RoleSpec = {
  role: 'release-smoke-user',
  username: 'release-smoke-user',
  password: 'release-smoke-user-not-for-production',
  filePath: 'test-results/release-smoke/auth/release-smoke-user.json',
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.PLAYWRIGHT_SKIP_AUTH_SETUP) {
    console.warn(
      '[release-smoke global-setup] PLAYWRIGHT_SKIP_AUTH_SETUP is set; not seeding storageState. Specs that require auth will fail.',
    )
    return
  }

  const baseUrl = getPlaywrightBaseUrl(config, 'https://kravhantering.test')
  try {
    await loginAndSaveStorageState(baseUrl, RELEASE_SMOKE_USER)
    console.info(
      `[release-smoke global-setup] Stored ${RELEASE_SMOKE_USER.role} session at ${RELEASE_SMOKE_USER.filePath}`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to obtain ${RELEASE_SMOKE_USER.role} storageState via Keycloak. Make sure the container stack is running at ${baseUrl} and NODE_EXTRA_CA_CERTS points at tmp/container-tls/ca.crt. Original error: ${message}`,
    )
  }
}
