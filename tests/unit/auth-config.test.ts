import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthConfig, resetAuthConfigForTests } from '@/lib/auth/config'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

const TRACKED_ENV_KEYS = [
  'AUTH_ALLOW_DISABLE_IN_PRODUCTION',
  'AUTH_ENABLED',
  'AUTH_OIDC_CLIENT_ID',
  'AUTH_OIDC_CLIENT_SECRET',
  'AUTH_OIDC_ISSUER_URL',
  'AUTH_OIDC_POST_LOGOUT_REDIRECT_URI',
  'AUTH_OIDC_REDIRECT_URI',
  'AUTH_SESSION_COOKIE_PASSWORD',
  'NODE_ENV',
] as const

const env = process.env as Record<string, string | undefined>
const originalEnv = Object.fromEntries(
  TRACKED_ENV_KEYS.map(key => [key, env[key]]),
) as Record<(typeof TRACKED_ENV_KEYS)[number], string | undefined>

function restoreTrackedEnv() {
  for (const key of TRACKED_ENV_KEYS) {
    const value = originalEnv[key]
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }
}

function setBaseAuthEnv() {
  env.AUTH_ENABLED = 'true'
  delete env.AUTH_ALLOW_DISABLE_IN_PRODUCTION
  env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
  env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app-prod'
  env.AUTH_OIDC_CLIENT_SECRET = 'prod-secret-value'
  env.AUTH_OIDC_REDIRECT_URI = 'https://app.example.com/api/auth/callback'
  env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'https://app.example.com/'
  env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
}

describe('auth config', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setBaseAuthEnv()
    resetAuthConfigForTests()
  })

  afterEach(() => {
    warnSpy.mockRestore()
    restoreTrackedEnv()
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

  it('rejects placeholder auth values in production', () => {
    env.NODE_ENV = 'production'
    env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app'
    env.AUTH_OIDC_CLIENT_SECRET = 'dev-only-app-secret'
    env.AUTH_SESSION_COOKIE_PASSWORD =
      'prodlike-only-cookie-password-not-for-production-32chars'
    resetAuthConfigForTests()

    expect(() => getAuthConfig()).toThrow(
      /placeholder auth configuration in production/,
    )
  })
})
