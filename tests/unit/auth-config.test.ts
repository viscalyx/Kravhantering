import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthConfig, resetAuthConfigForTests } from '@/lib/auth/config'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

function setBaseAuthEnv() {
  process.env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
  process.env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app'
  process.env.AUTH_OIDC_CLIENT_SECRET = 'secret'
  process.env.AUTH_OIDC_REDIRECT_URI =
    'https://app.example.com/api/auth/callback'
  process.env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'https://app.example.com/'
  process.env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
}

describe('auth config', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  const env = process.env as Record<string, string | undefined>
  const originalNodeEnv = env.NODE_ENV

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setBaseAuthEnv()
    resetAuthConfigForTests()
  })

  afterEach(() => {
    warnSpy.mockRestore()
    env.NODE_ENV = originalNodeEnv
    delete env.AUTH_ALLOW_DISABLE_IN_PRODUCTION
    delete env.AUTH_ENABLED
    resetAuthConfigForTests()
  })

  it('accepts truthy AUTH_ALLOW_DISABLE_IN_PRODUCTION values', () => {
    env.NODE_ENV = 'production'
    env.AUTH_ENABLED = 'false'
    env.AUTH_ALLOW_DISABLE_IN_PRODUCTION = 'yes'
    resetAuthConfigForTests()

    expect(getAuthConfig().enabled).toBe(false)
  })

  it('still rejects AUTH_ENABLED=false in production without the escape hatch', () => {
    env.NODE_ENV = 'production'
    env.AUTH_ENABLED = 'false'
    resetAuthConfigForTests()

    expect(() => getAuthConfig()).toThrow(
      'AUTH_ENABLED=false is rejected in production. Refusing to boot.',
    )
  })
})
