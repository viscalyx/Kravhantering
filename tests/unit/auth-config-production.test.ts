import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/runtime/build-target', () => ({ BUILD_TARGET: 'prod' }))

import {
  AuthConfigError,
  getAuthConfig,
  resetAuthConfigForTests,
} from '@/lib/auth/config'
import {
  SHIPPED_OIDC_CLIENT_SECRET_SENTINELS,
  SHIPPED_SESSION_COOKIE_SENTINELS,
} from '../fixtures/auth-placeholder-sentinels.mjs'

const COOKIE_PASSWORD =
  'unique-production-cookie-password-with-more-than-32-characters'

const SHIPPED_AUTH_SECRET_SENTINELS = [
  ...SHIPPED_OIDC_CLIENT_SECRET_SENTINELS.map(
    sentinel => ['AUTH_OIDC_CLIENT_SECRET', sentinel] as const,
  ),
  ...SHIPPED_SESSION_COOKIE_SENTINELS.map(
    sentinel => ['AUTH_SESSION_COOKIE_PASSWORD', sentinel] as const,
  ),
]

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

function setProductionAuthEnv(): void {
  env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
  env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app-prod'
  env.AUTH_OIDC_CLIENT_SECRET = 'unique-production-oidc-secret'
  env.AUTH_OIDC_REDIRECT_URI = 'https://app.example.com/api/auth/callback'
  env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'https://app.example.com/'
  env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
}

describe('production auth config', () => {
  beforeEach(() => {
    setProductionAuthEnv()
    resetAuthConfigForTests()
  })

  afterEach(() => {
    for (const key of TRACKED_ENV_KEYS) {
      const value = originalEnv[key]
      if (value === undefined) {
        delete env[key]
      } else {
        env[key] = value
      }
    }
    resetAuthConfigForTests()
  })

  it.each(SHIPPED_AUTH_SECRET_SENTINELS)(
    'rejects shipped %s sentinel without exposing it',
    (field, sentinel) => {
      env[field] = sentinel
      resetAuthConfigForTests()

      try {
        getAuthConfig()
      } catch (error) {
        expect(error).toBeInstanceOf(AuthConfigError)
        expect((error as Error).message).toContain(field)
        expect((error as Error).message).not.toContain(sentinel)
        return
      }

      throw new Error(`expected shipped ${field} sentinel to be rejected`)
    },
  )
})
