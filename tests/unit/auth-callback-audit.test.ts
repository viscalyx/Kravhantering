import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAuthConfigForTests } from '@/lib/auth/config'

const COOKIE_PASSWORD =
  'test-cookie-password-must-be-at-least-32-characters-long'

const loginStateMock = {
  codeVerifier: 'verifier',
  state: 'state',
  nonce: 'nonce',
  returnTo: '/sv/requirements',
  issuedAt: 0,
  destroy: vi.fn(),
}

const getLoginStateMock = vi.fn()
const getSessionMock = vi.fn()
const getOidcConfigurationMock = vi.fn()
const authorizationCodeGrantMock = vi.fn()
const estimateSerializedSessionCookieLengthMock = vi.fn()

vi.mock('@/lib/auth/login-state', () => ({
  getLoginState: () => getLoginStateMock(),
}))
vi.mock('@/lib/auth/session', () => ({
  estimateSerializedSessionCookieLength: (...args: unknown[]) =>
    estimateSerializedSessionCookieLengthMock(...args),
  getSession: () => getSessionMock(),
  isSignedIn: () => false,
}))
vi.mock('@/lib/auth/oidc', () => ({
  getOidcConfiguration: () => getOidcConfigurationMock(),
  oidcClient: {
    authorizationCodeGrant: (...args: unknown[]) =>
      authorizationCodeGrantMock(...args),
  },
}))
vi.mock('@/i18n/routing', () => ({
  routing: { defaultLocale: 'sv', locales: ['sv', 'en'] },
}))

function buildCallbackRequest(
  url = 'http://localhost/api/auth/callback?code=abc&state=state',
): NextRequest {
  return new NextRequest(url)
}

function freshLoginState(overrides: Partial<typeof loginStateMock> = {}) {
  return {
    codeVerifier: 'verifier',
    state: 'state',
    nonce: 'nonce',
    returnTo: '/sv/requirements',
    issuedAt: 0,
    destroy: vi.fn(),
    ...overrides,
  }
}

function freshPriorSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { save: vi.fn(), destroy: vi.fn(), ...overrides }
}

const SUCCESS_CLAIMS = {
  sub: 'user-1',
  given_name: 'Alice',
  family_name: 'Reviewer',
  employeeHsaId: 'SE2321000032-rev1',
  roles: ['Reviewer'],
}

function mockAuthEnv() {
  process.env.AUTH_ENABLED = 'true'
  process.env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
  process.env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app'
  process.env.AUTH_OIDC_CLIENT_SECRET = 'secret'
  process.env.AUTH_OIDC_REDIRECT_URI = 'http://localhost:3000/api/auth/callback'
  process.env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'http://localhost:3000/'
  process.env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
  resetAuthConfigForTests()
}

describe('auth callback security audit events', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockAuthEnv()
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    getLoginStateMock.mockReset()
    getSessionMock.mockReset()
    getOidcConfigurationMock.mockReset()
    authorizationCodeGrantMock.mockReset()
    estimateSerializedSessionCookieLengthMock.mockReset()
    getOidcConfigurationMock.mockResolvedValue({})
    estimateSerializedSessionCookieLengthMock.mockResolvedValue(512)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function emittedSecurityEvents(): Array<Record<string, unknown>> {
    return infoSpy.mock.calls
      .map((call: unknown[]) => {
        try {
          return JSON.parse(String(call[0])) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter(
        (ev: Record<string, unknown> | null): ev is Record<string, unknown> =>
          ev !== null && ev.channel === 'security-audit',
      )
  }

  async function importGet() {
    const mod = await import('@/app/api/auth/callback/route')
    return mod.GET
  }

  it('emits auth.login.failed with reason=code_verifier_missing', async () => {
    getLoginStateMock.mockResolvedValue(
      freshLoginState({ codeVerifier: '' as never }),
    )
    getSessionMock.mockResolvedValue(freshPriorSession())
    const GET = await importGet()
    await GET(buildCallbackRequest())
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.login.failed')
    expect((events[0].detail as Record<string, unknown>).reason).toBe(
      'code_verifier_missing',
    )
  })

  it('emits auth.login.failed with reason=state_missing', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState({ state: '' as never }))
    getSessionMock.mockResolvedValue(freshPriorSession())
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(emittedSecurityEvents()[0].event).toBe('auth.login.failed')
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('state_missing')
  })

  it('emits auth.login.failed with reason=nonce_missing', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState({ nonce: '' as never }))
    getSessionMock.mockResolvedValue(freshPriorSession())
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('nonce_missing')
  })

  it('emits auth.login.failed with reason=token_exchange_failed and errorName', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(freshPriorSession())
    class TokenExchangeError extends Error {
      override name = 'TokenExchangeError'
    }
    authorizationCodeGrantMock.mockRejectedValue(
      new TokenExchangeError('bad code'),
    )
    const GET = await importGet()
    await GET(buildCallbackRequest())
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.login.failed')
    expect(events[0].detail).toEqual({
      reason: 'token_exchange_failed',
      errorName: 'TokenExchangeError',
    })
  })

  it('emits auth.login.failed with reason=sub_claim_missing', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(freshPriorSession())
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ sub: '' }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('sub_claim_missing')
  })

  it('emits auth.login.failed with reason=given_name_missing', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(freshPriorSession())
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, given_name: '' }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('given_name_missing')
  })

  it('emits auth.login.failed with reason=family_name_missing', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(freshPriorSession())
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, family_name: '' }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('family_name_missing')
  })

  it('emits both missing-name reasons when given_name and family_name are absent', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(freshPriorSession())
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, given_name: '', family_name: '' }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('given_name_missing,family_name_missing')
  })

  it('emits auth.login.failed with reason=hsa_id_missing', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(freshPriorSession())
    const { employeeHsaId, ...rest } = SUCCESS_CLAIMS
    void employeeHsaId
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => rest,
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('hsa_id_missing')
  })

  it('emits auth.login.failed with reason=hsa_id_invalid', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(freshPriorSession())
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, employeeHsaId: 'not-an-hsa-id' }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('hsa_id_invalid')
  })

  it('emits auth.login.succeeded with sorted roles on a happy path', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(freshPriorSession())
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, roles: ['Reviewer', 'Admin'] }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.login.succeeded')
    expect(events[0].outcome).toBe('success')
    expect(events[0].detail).toEqual({ roles: ['Admin', 'Reviewer'] })
    expect(events[0].actor).toEqual({
      source: 'oidc',
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
    })
  })

  it('emits auth.roles.changed when prior session roles differ', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(
      freshPriorSession({ sub: 'user-1', roles: ['Reviewer'] }),
    )
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, roles: ['Admin'] }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    const events = emittedSecurityEvents()
    expect(events.map(e => e.event)).toEqual([
      'auth.login.succeeded',
      'auth.roles.changed',
    ])
    expect(events[1].detail).toEqual({
      before: ['Reviewer'],
      after: ['Admin'],
    })
  })

  it('does NOT emit auth.roles.changed when roles are unchanged', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(
      freshPriorSession({ sub: 'user-1', roles: ['Reviewer'] }),
    )
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, roles: ['Reviewer'] }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    const events = emittedSecurityEvents().map(e => e.event)
    expect(events).toEqual(['auth.login.succeeded'])
  })

  it('does NOT emit auth.roles.changed on first-ever login (no prior sub)', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(freshPriorSession())
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, roles: ['Admin'] }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })
    const GET = await importGet()
    await GET(buildCallbackRequest())
    const events = emittedSecurityEvents().map(e => e.event)
    expect(events).toEqual(['auth.login.succeeded'])
  })

  it('redirects to the configured public origin after a successful login', async () => {
    getLoginStateMock.mockResolvedValue(
      freshLoginState({ returnTo: '/sv/requirements?tab=open' }),
    )
    getSessionMock.mockResolvedValue(freshPriorSession())
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, roles: ['Admin'] }),
      expiresIn: () => 3600,
      id_token: 'idt',
    })

    const GET = await importGet()
    const response = await GET(
      buildCallbackRequest(
        'http://internal-host/api/auth/callback?code=abc&state=state',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/sv/requirements?tab=open',
    )
  })

  it('uses the conservative token-expiry fallback when expiresIn is missing', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    getLoginStateMock.mockResolvedValue(freshLoginState())
    const priorSession = freshPriorSession()
    const currentSession = freshPriorSession()
    getSessionMock
      .mockResolvedValueOnce(priorSession)
      .mockResolvedValueOnce(currentSession)
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, roles: ['Reviewer'] }),
      expiresIn: () => undefined,
      id_token: 'idt',
    })

    const GET = await importGet()
    await GET(buildCallbackRequest())

    expect(currentSession.accessTokenExpiresAt).toBe(1_700_000_300)
    expect(currentSession.save).toHaveBeenCalledOnce()
  })

  it('omits idToken from the saved session when the cookie budget would overflow', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    const priorSession = freshPriorSession()
    const currentSession = freshPriorSession({ idToken: 'old-token' })
    getSessionMock
      .mockResolvedValueOnce(priorSession)
      .mockResolvedValueOnce(currentSession)
    estimateSerializedSessionCookieLengthMock.mockResolvedValue(4097)
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({ ...SUCCESS_CLAIMS, roles: ['Reviewer'] }),
      expiresIn: () => 3600,
      id_token: 'oversized-id-token',
    })

    const GET = await importGet()
    await GET(buildCallbackRequest())

    expect(estimateSerializedSessionCookieLengthMock).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: 'oversized-id-token' }),
    )
    expect(currentSession.idToken).toBeUndefined()
    expect(currentSession.save).toHaveBeenCalledOnce()
  })
})
