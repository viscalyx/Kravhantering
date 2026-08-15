import { describe, expect, it, vi } from 'vitest'
import {
  RuntimeAuthConfigError,
  startRuntime,
  validateRuntimeAuthEnvironment,
} from '../../containers/app/start-runtime.mjs'

const COOKIE_PASSWORD =
  'unique-production-cookie-password-with-more-than-32-characters'

const SHIPPED_AUTH_SECRET_SENTINELS = [
  ['AUTH_OIDC_CLIENT_SECRET', 'dev-only-app-secret'],
  ['AUTH_OIDC_CLIENT_SECRET', 'prodlike-kc-app-secret'],
  ['AUTH_OIDC_CLIENT_SECRET', 'container-demo-app-secret-not-for-production'],
  ['AUTH_OIDC_CLIENT_SECRET', 'replace-with-oidc-client-secret'],
  [
    'AUTH_SESSION_COOKIE_PASSWORD',
    'dev-only-cookie-password-not-for-production-32chars-min',
  ],
  [
    'AUTH_SESSION_COOKIE_PASSWORD',
    'local-kc-session-key-not-for-production-32chars',
  ],
  [
    'AUTH_SESSION_COOKIE_PASSWORD',
    'container-demo-session-key-not-for-production-32chars',
  ],
  [
    'AUTH_SESSION_COOKIE_PASSWORD',
    'replace-with-at-least-32-random-characters',
  ],
]

function productionAuthEnv() {
  return {
    AUTH_OIDC_CLIENT_ID: 'kravhantering-app-prod',
    AUTH_OIDC_CLIENT_SECRET: 'unique-production-oidc-secret',
    AUTH_OIDC_ISSUER_URL: 'https://issuer.example.com',
    AUTH_OIDC_POST_LOGOUT_REDIRECT_URI: 'https://app.example.com/',
    AUTH_OIDC_REDIRECT_URI: 'https://app.example.com/api/auth/callback',
    AUTH_SESSION_COOKIE_PASSWORD: COOKIE_PASSWORD,
  }
}

describe('application runtime startup', () => {
  it.each(SHIPPED_AUTH_SECRET_SENTINELS)(
    'rejects shipped %s sentinel without exposing it',
    (field, sentinel) => {
      const env = { ...productionAuthEnv(), [field]: sentinel }

      try {
        validateRuntimeAuthEnvironment(env)
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeAuthConfigError)
        expect(error.message).toContain(field)
        expect(error.message).not.toContain(sentinel)
        return
      }

      throw new Error(`expected shipped ${field} sentinel to be rejected`)
    },
  )

  it('does not load the server when authentication validation fails', async () => {
    const loadServer = vi.fn()
    const env = {
      ...productionAuthEnv(),
      AUTH_SESSION_COOKIE_PASSWORD: 'too-short',
    }

    await expect(startRuntime({ env, loadServer })).rejects.toThrow(
      'AUTH_SESSION_COOKIE_PASSWORD',
    )
    expect(loadServer).not.toHaveBeenCalled()
  })

  it('loads the server after deployment-injected authentication validates', async () => {
    const loadServer = vi.fn(async () => undefined)

    await startRuntime({ env: productionAuthEnv(), loadServer })

    expect(loadServer).toHaveBeenCalledOnce()
  })
})
