import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AuthConfigError,
  getAuthConfig,
  resetAuthConfigForTests,
} from '@/lib/auth/config'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

const TRACKED_ENV_KEYS = [
  'AUTH_OIDC_CLIENT_ID',
  'AUTH_OIDC_CLIENT_SECRET',
  'AUTH_OIDC_ISSUER_URL',
  'AUTH_OIDC_POST_LOGOUT_REDIRECT_URI',
  'AUTH_OIDC_REDIRECT_URI',
  'AUTH_SESSION_COOKIE_PASSWORD',
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
  env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
  env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app-prod'
  env.AUTH_OIDC_CLIENT_SECRET = 'prod-secret-value'
  env.AUTH_OIDC_REDIRECT_URI = 'https://app.example.com/api/auth/callback'
  env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'https://app.example.com/'
  env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
}

describe('auth config', () => {
  beforeEach(() => {
    setBaseAuthEnv()
    resetAuthConfigForTests()
  })

  afterEach(() => {
    restoreTrackedEnv()
    resetAuthConfigForTests()
  })

  it('loads a fully-populated config from env vars', () => {
    const cfg = getAuthConfig()
    expect(cfg.issuerUrl).toBe('https://issuer.example.com')
    expect(cfg.clientId).toBe('kravhantering-app-prod')
    expect(cfg.cookiePassword.length).toBeGreaterThanOrEqual(32)
  })

  it('throws AuthConfigError when a required env var is missing', () => {
    delete env.AUTH_OIDC_ISSUER_URL
    resetAuthConfigForTests()
    expect(() => getAuthConfig()).toThrow(AuthConfigError)
  })

  it('throws when cookie password is shorter than 32 chars', () => {
    env.AUTH_SESSION_COOKIE_PASSWORD = 'too-short'
    resetAuthConfigForTests()
    expect(() => getAuthConfig()).toThrow(/at least 32 characters/)
  })
})
