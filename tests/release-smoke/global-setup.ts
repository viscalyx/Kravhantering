import type { FullConfig } from '@playwright/test'
import {
  getPlaywrightBaseUrl,
  loginAndSaveStorageState,
} from '@/tests/support/playwright-auth'
import { RELEASE_SMOKE_AUTHOR, RELEASE_SMOKE_ROLES } from './auth-roles'

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.PLAYWRIGHT_SKIP_AUTH_SETUP) {
    console.warn(
      '[release-smoke global-setup] PLAYWRIGHT_SKIP_AUTH_SETUP is set; not seeding storageState. Specs that require auth will fail.',
    )
    return
  }

  const baseUrl = getPlaywrightBaseUrl(config, 'https://kravhantering.test')
  try {
    for (const role of process.env.PRODUCTION_SMOKE_SCOPE === 'core'
      ? [RELEASE_SMOKE_AUTHOR]
      : RELEASE_SMOKE_ROLES) {
      await loginAndSaveStorageState(baseUrl, role)
      console.info(
        `[release-smoke global-setup] Stored ${role.role} session at ${role.filePath}`,
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to obtain release-smoke storageState via Keycloak. Make sure the production-smoke Quadlet target is running at ${baseUrl} and NODE_EXTRA_CA_CERTS points at tmp/container-tls/ca.crt. Original error: ${message}`,
    )
  }
}
