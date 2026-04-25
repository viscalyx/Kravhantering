import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { type FullConfig, request as playwrightRequest } from '@playwright/test'

/**
 * Default Playwright role used by integration specs that do not opt into a
 * different role explicitly. See `tests/integration/auth-storage.ts` for the
 * role -> storageState mapping.
 */
export const DEFAULT_INTEGRATION_ROLE = 'admin'

interface RoleSpec {
  filePath: string
  password: string
  role: string
  username: string
}

const ROLES: ReadonlyArray<RoleSpec> = [
  {
    role: 'admin',
    username: 'ada.admin',
    password: 'devpass',
    filePath: 'test-results/auth/admin.json',
  },
  {
    role: 'reviewer',
    username: 'rita.reviewer',
    password: 'devpass',
    filePath: 'test-results/auth/reviewer.json',
  },
]

function getBaseUrl(config: FullConfig): string {
  const fromEnv = process.env.PLAYWRIGHT_BASE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const projectBaseUrl = config.projects[0]?.use?.baseURL
  if (projectBaseUrl) return projectBaseUrl.replace(/\/$/, '')
  return 'http://localhost:3000'
}

/**
 * Drives a real Keycloak login over HTTP using Playwright's request context.
 * The flow follows the production redirect chain unchanged:
 *   1. GET  /api/auth/login                  -> 302 to Keycloak /authorize
 *   2. GET  Keycloak /authorize              -> 200 with login form
 *   3. POST Keycloak login form              -> 302 to /api/auth/callback?code=...
 *   4. GET  /api/auth/callback?code=...      -> 302 to / with iron-session cookie
 *
 * Saves the resulting cookie jar via `request.storageState({ path })` so each
 * test worker can reuse the session via `test.use({ storageState })`.
 */
async function loginAndSaveStorageState(
  baseUrl: string,
  spec: RoleSpec,
): Promise<void> {
  await mkdir(dirname(spec.filePath), { recursive: true })

  const context = await playwrightRequest.newContext({
    baseURL: baseUrl,
    ignoreHTTPSErrors: true,
  })

  const loginPage = await context.get('/api/auth/login')
  if (!loginPage.ok()) {
    throw new Error(
      `Failed to start login flow at ${baseUrl}/api/auth/login: ${loginPage.status()} ${loginPage.statusText()}`,
    )
  }
  const loginHtml = await loginPage.text()

  const actionMatch = loginHtml.match(
    /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/i,
  )
  if (!actionMatch) {
    throw new Error(
      `Could not locate Keycloak login form in response from ${loginPage.url()}`,
    )
  }
  const formAction = decodeHtmlEntities(actionMatch[1])

  const callbackResponse = await context.post(formAction, {
    form: {
      username: spec.username,
      password: spec.password,
      credentialId: '',
    },
  })
  if (!callbackResponse.ok()) {
    throw new Error(
      `Keycloak credential submission for ${spec.username} returned ${callbackResponse.status()} ${callbackResponse.statusText()} (final URL ${callbackResponse.url()})`,
    )
  }

  const me = await context.get('/api/auth/me')
  const meBody = (await me.json()) as { authenticated?: boolean }
  if (!meBody.authenticated) {
    throw new Error(
      `Login flow finished but /api/auth/me reported authenticated=false for ${spec.username}`,
    )
  }

  await context.storageState({ path: spec.filePath })
  await context.dispose()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (process.env.PLAYWRIGHT_SKIP_AUTH_SETUP) {
    console.warn(
      '[playwright global-setup] PLAYWRIGHT_SKIP_AUTH_SETUP is set; not seeding storageState. Specs that require auth will fail.',
    )
    return
  }

  const baseUrl = getBaseUrl(config)
  for (const spec of ROLES) {
    try {
      await loginAndSaveStorageState(baseUrl, spec)
      console.warn(
        `[playwright global-setup] Stored ${spec.role} session at ${spec.filePath}`,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(
        `Failed to obtain ${spec.role} storageState via Keycloak. Make sure the IdP is running (\`npm run idp:up\`) and the dev server is reachable at ${baseUrl}. Original error: ${message}`,
      )
    }
  }
}
