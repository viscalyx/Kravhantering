import type { FullConfig } from '@playwright/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getPlaywrightBaseUrl,
  loginAndSaveStorageState,
  type RoleSpec,
} from '@/tests/support/playwright-auth'

const originalBaseUrl = process.env.PLAYWRIGHT_BASE_URL

function configWithBaseUrl(baseURL?: string): FullConfig {
  return {
    projects: baseURL ? [{ use: { baseURL } }] : [],
  } as FullConfig
}

function response(options: {
  json?: unknown
  ok?: boolean
  status?: number
  statusText?: string
  text?: string
  url?: string
}) {
  return {
    json: vi.fn(async () => options.json ?? {}),
    ok: vi.fn(() => options.ok ?? true),
    status: vi.fn(() => options.status ?? 200),
    statusText: vi.fn(() => options.statusText ?? 'OK'),
    text: vi.fn(async () => options.text ?? ''),
    url: vi.fn(() => options.url ?? 'https://kravhantering.test/'),
  }
}

describe('playwright auth helpers', () => {
  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.PLAYWRIGHT_BASE_URL
    } else {
      process.env.PLAYWRIGHT_BASE_URL = originalBaseUrl
    }
    vi.restoreAllMocks()
  })

  it('resolves base URL from env, project config, then fallback', () => {
    process.env.PLAYWRIGHT_BASE_URL = 'https://env.example/'
    expect(
      getPlaywrightBaseUrl(
        configWithBaseUrl('https://project.example/'),
        'https://fallback.example',
      ),
    ).toBe('https://env.example')

    delete process.env.PLAYWRIGHT_BASE_URL
    expect(
      getPlaywrightBaseUrl(
        configWithBaseUrl('https://project.example/'),
        'https://fallback.example',
      ),
    ).toBe('https://project.example')
    expect(
      getPlaywrightBaseUrl(configWithBaseUrl(), 'https://fallback.example'),
    ).toBe('https://fallback.example')
  })

  it('drives Keycloak login and stores storageState with TLS verification by default', async () => {
    const spec: RoleSpec = {
      filePath: 'test-results/release-smoke/auth/user.json',
      password: 'secret',
      role: 'release-smoke-user',
      username: 'release-smoke-user',
    }
    const loginHtml =
      '<form id="kc-form-login" action="/auth/realms/test/login"></form>'
    const context = {
      dispose: vi.fn(async () => undefined),
      get: vi.fn(async (path: string) => {
        if (path === '/api/auth/login') {
          return response({
            text: loginHtml,
            url: 'https://kravhantering.test/api/auth/login',
          })
        }
        if (path === '/api/auth/me') {
          return response({ json: { authenticated: true } })
        }
        throw new Error(`Unexpected GET ${path}`)
      }),
      post: vi.fn(async () =>
        response({ url: 'https://kravhantering.test/api/auth/callback' }),
      ),
      storageState: vi.fn(async () => undefined),
    }
    const mkdirImpl = vi.fn(async () => undefined)
    const newContext = vi.fn(async () => context)

    await loginAndSaveStorageState('https://kravhantering.test', spec, {
      mkdirImpl,
      newContext,
    })

    expect(newContext).toHaveBeenCalledWith({
      baseURL: 'https://kravhantering.test',
      ignoreHTTPSErrors: false,
    })
    expect(mkdirImpl).toHaveBeenCalledWith('test-results/release-smoke/auth', {
      recursive: true,
    })
    expect(context.post).toHaveBeenCalledWith(
      'https://kravhantering.test/auth/realms/test/login',
      {
        form: {
          credentialId: '',
          password: 'secret',
          username: 'release-smoke-user',
        },
      },
    )
    expect(context.storageState).toHaveBeenCalledWith({ path: spec.filePath })
    expect(context.dispose).toHaveBeenCalled()
  })

  it('keeps the integration setup able to opt into ignored HTTPS errors', async () => {
    const spec: RoleSpec = {
      filePath: 'test-results/auth/admin.json',
      password: 'devpass',
      role: 'admin',
      username: 'ada.admin',
    }
    const context = {
      dispose: vi.fn(async () => undefined),
      get: vi.fn(async (path: string) =>
        path === '/api/auth/login'
          ? response({
              text: '<form action="/login"></form>',
              url: 'http://localhost:3000/api/auth/login',
            })
          : response({ json: { authenticated: true } }),
      ),
      post: vi.fn(async () => response({ url: 'http://localhost/callback' })),
      storageState: vi.fn(async () => undefined),
    }
    const newContext = vi.fn(async () => context)

    await loginAndSaveStorageState('http://localhost:3000', spec, {
      ignoreHTTPSErrors: true,
      mkdirImpl: vi.fn(async () => undefined),
      newContext,
    })

    expect(newContext).toHaveBeenCalledWith({
      baseURL: 'http://localhost:3000',
      ignoreHTTPSErrors: true,
    })
  })
})
