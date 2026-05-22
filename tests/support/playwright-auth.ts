import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { type FullConfig, request as playwrightRequest } from '@playwright/test'
import {
  describeKeycloakLoginFormActionError,
  extractKeycloakLoginFormAction,
} from '@/scripts/lib/keycloak-login-form.mjs'

export interface RoleSpec {
  filePath: string
  password: string
  role: string
  username: string
}

interface LoginResponse {
  json(): Promise<unknown>
  ok(): boolean
  status(): number
  statusText(): string
  text(): Promise<string>
  url(): string
}

interface LoginRequestContext {
  dispose(): Promise<unknown>
  get(path: string): Promise<LoginResponse>
  post(
    url: string,
    options: { form: Record<string, string> },
  ): Promise<LoginResponse>
  storageState(options: { path: string }): Promise<unknown>
}

interface NewRequestContextOptions {
  baseURL: string
  ignoreHTTPSErrors: boolean
}

export interface LoginStorageStateOptions {
  ignoreHTTPSErrors?: boolean
  mkdirImpl?: typeof mkdir
  newContext?: (
    options: NewRequestContextOptions,
  ) => Promise<LoginRequestContext>
}

/**
 * Returns the file paths from `roles` whose pinned storage-state JSON does
 * not exist on disk. Exported so unit tests can verify pre-flight behavior
 * without touching real files.
 */
export function findMissingRoleFiles(
  roles: ReadonlyArray<RoleSpec>,
  fileExists: (path: string) => boolean = existsSync,
): string[] {
  return roles.filter(spec => !fileExists(spec.filePath)).map(s => s.filePath)
}

export function getPlaywrightBaseUrl(
  config: FullConfig,
  fallback: string,
): string {
  const fromEnv = process.env.PLAYWRIGHT_BASE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const projectBaseUrl = config.projects[0]?.use?.baseURL
  if (projectBaseUrl) return projectBaseUrl.replace(/\/$/, '')
  return fallback
}

/**
 * Drives a real Keycloak login over HTTP using Playwright's request context.
 * The flow follows the production redirect chain unchanged, then saves the
 * resulting cookie jar for specs to reuse through `storageState`.
 */
export async function loginAndSaveStorageState(
  baseUrl: string,
  spec: RoleSpec,
  options: LoginStorageStateOptions = {},
): Promise<void> {
  const mkdirImpl = options.mkdirImpl ?? mkdir
  const newContext =
    options.newContext ??
    ((contextOptions: NewRequestContextOptions) =>
      playwrightRequest.newContext(
        contextOptions,
      ) as Promise<LoginRequestContext>)
  const context = await newContext({
    baseURL: baseUrl,
    ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? false,
  })

  try {
    await mkdirImpl(dirname(spec.filePath), { recursive: true })

    const loginPage = await context.get('/api/auth/login')
    if (!loginPage.ok()) {
      throw new Error(
        `Failed to start login flow at ${baseUrl}/api/auth/login: ${loginPage.status()} ${loginPage.statusText()}`,
      )
    }
    const loginHtml = await loginPage.text()

    const formAction = extractKeycloakLoginFormAction(loginHtml)
    if (!formAction) {
      throw new Error(describeKeycloakLoginFormActionError(loginPage.url()))
    }
    const resolvedFormAction = new URL(formAction, loginPage.url()).toString()

    const callbackResponse = await context.post(resolvedFormAction, {
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
  } finally {
    await context.dispose()
  }
}
