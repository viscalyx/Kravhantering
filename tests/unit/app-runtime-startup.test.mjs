import { describe, expect, it, vi } from 'vitest'
import {
  RuntimeAuthConfigError,
  startRuntime,
} from '../../containers/app/start-runtime.mjs'
import {
  SHIPPED_OIDC_CLIENT_SECRET_SENTINELS,
  SHIPPED_SESSION_COOKIE_SENTINELS,
} from '../fixtures/auth-placeholder-sentinels.mjs'

const COOKIE_PASSWORD =
  'unique-production-cookie-password-with-more-than-32-characters'

const SHIPPED_AUTH_SECRET_SENTINELS = [
  ...SHIPPED_OIDC_CLIENT_SECRET_SENTINELS.map(sentinel => [
    'AUTH_OIDC_CLIENT_SECRET',
    sentinel,
  ]),
  ...SHIPPED_SESSION_COOKIE_SENTINELS.map(sentinel => [
    'AUTH_SESSION_COOKIE_PASSWORD',
    sentinel,
  ]),
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
    async (field, sentinel) => {
      const env = { ...productionAuthEnv(), [field]: sentinel }
      const loadServer = vi.fn()

      try {
        await startRuntime({ env, loadServer })
      } catch (error) {
        expect(error).toBeInstanceOf(RuntimeAuthConfigError)
        expect(error.message).toContain(field)
        expect(error.message).not.toContain(sentinel)
        expect(loadServer).not.toHaveBeenCalled()
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
