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
  init: {
    accept?: string
    cookie?: string
    forwardedHost?: string
    forwardedProto?: string
    secFetchDest?: string
  } = {},
): NextRequest {
  const headers = new Headers()
  if (init.accept) headers.set('accept', init.accept)
  if (init.cookie) headers.set('cookie', init.cookie)
  if (init.forwardedHost) headers.set('x-forwarded-host', init.forwardedHost)
  if (init.forwardedProto) {
    headers.set('x-forwarded-proto', init.forwardedProto)
  }
  if (init.secFetchDest) headers.set('sec-fetch-dest', init.secFetchDest)
  return new NextRequest(url, { headers })
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
  employeeHsaId: 'SE5560000001-rev1',
  roles: ['Reviewer'],
}

function mockAuthEnv() {
  process.env.AUTH_OIDC_ISSUER_URL = 'https://issuer.example.com'
  process.env.AUTH_OIDC_CLIENT_ID = 'kravhantering-app'
  process.env.AUTH_OIDC_CLIENT_SECRET = 'secret'
  process.env.AUTH_OIDC_REDIRECT_URI = 'http://localhost:3000/api/auth/callback'
  process.env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI = 'http://localhost:3000/'
  process.env.AUTH_SESSION_COOKIE_PASSWORD = COOKIE_PASSWORD
  resetAuthConfigForTests()
}

describe('auth callback security audit events', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockAuthEnv()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
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

  it('rejects callbacks without code or error before login state lookup', async () => {
    const GET = await importGet()
    const response = await GET(
      buildCallbackRequest('http://localhost/api/auth/callback?state=state'),
    )
    const body = (await response.json()) as {
      error: string
      issues: Array<{ message: string }>
    }

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'OIDC callback must include exactly one of code or error.',
        }),
      ]),
    )
    expect(getLoginStateMock).not.toHaveBeenCalled()
    expect(authorizationCodeGrantMock).not.toHaveBeenCalled()
  })

  it('rejects callbacks with both code and error before login state lookup', async () => {
    const GET = await importGet()
    const response = await GET(
      buildCallbackRequest(
        'http://localhost/api/auth/callback?code=abc&error=access_denied&state=state',
      ),
    )
    const body = (await response.json()) as {
      error: string
      issues: Array<{ message: string }>
    }

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'OIDC callback must include exactly one of code or error.',
        }),
      ]),
    )
    expect(getLoginStateMock).not.toHaveBeenCalled()
    expect(authorizationCodeGrantMock).not.toHaveBeenCalled()
  })

  it('returns provider callback errors without token exchange', async () => {
    const loginState = freshLoginState()
    getLoginStateMock.mockResolvedValue(loginState)
    getSessionMock.mockResolvedValue(freshPriorSession())

    const GET = await importGet()
    const response = await GET(
      buildCallbackRequest(
        'http://localhost/api/auth/callback?error=access_denied&error_description=Denied&state=state',
      ),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'OIDC callback failed',
      code: 'oidc_error',
      detail: 'Denied',
      reason: 'access_denied',
    })
    expect(authorizationCodeGrantMock).not.toHaveBeenCalled()
    expect(loginState.destroy).toHaveBeenCalledOnce()
    expect(emittedSecurityEvents()).toContainEqual(
      expect.objectContaining({
        event: 'auth.login.failed',
        detail: {
          error: 'access_denied',
          reason: 'oidc_error',
        },
      }),
    )
  })

  it('emits auth.login.failed with reason=code_verifier_missing', async () => {
    const loginState = freshLoginState({ codeVerifier: '' as never })
    getLoginStateMock.mockResolvedValue(loginState)
    getSessionMock.mockResolvedValue(freshPriorSession())
    const GET = await importGet()
    const response = await GET(
      buildCallbackRequest(
        'http://localhost:3000/api/auth/callback?code=abc&state=sensitive-state-value',
        {
          accept: 'application/json',
          cookie: 'kravhantering_session_login=sealed-cookie-value',
        },
      ),
    )
    await expect(response.json()).resolves.toMatchObject({
      code: 'login_state_cookie_missing',
      error: 'Login callback failed',
      reason: 'code_verifier_missing',
    })
    const events = emittedSecurityEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('auth.login.failed')
    expect((events[0].detail as Record<string, unknown>).reason).toBe(
      'code_verifier_missing',
    )
    expect(loginState.destroy).toHaveBeenCalledOnce()
    expect(errorSpy).toHaveBeenCalledWith(
      'Login callback failed',
      expect.objectContaining({
        detail: expect.objectContaining({
          code: 'login_state_cookie_missing',
          configuredCallbackHost: 'localhost:3000',
          configuredCallbackProtocol: 'http',
          incomingHost: 'localhost:3000',
          incomingProtocol: 'http',
          likelyCause: 'login_state_expired_or_missing',
          loginStateCookiePresent: true,
          reason: 'code_verifier_missing',
          secureCookiesRequired: false,
        }),
      }),
    )
    const serializedErrorCalls = JSON.stringify(errorSpy.mock.calls)
    expect(serializedErrorCalls).not.toContain('abc')
    expect(serializedErrorCalls).not.toContain('sensitive-state-value')
    expect(serializedErrorCalls).not.toContain('sealed-cookie-value')
  })

  it('redirects browser callbacks with missing login state to the public auth error page', async () => {
    const loginState = freshLoginState({
      codeVerifier: '' as never,
      returnTo: '/en/specifications',
    })
    getLoginStateMock.mockResolvedValue(loginState)
    getSessionMock.mockResolvedValue(freshPriorSession())

    const GET = await importGet()
    const response = await GET(
      buildCallbackRequest(
        'http://test.example.test/api/auth/callback?code=abc',
        {
          accept: 'text/html',
          secFetchDest: 'document',
        },
      ),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/auth/error?code=login_state_cookie_missing&locale=en',
    )
    expect(loginState.destroy).toHaveBeenCalledOnce()
  })

  it('emits auth.login.failed with reason=state_missing', async () => {
    const loginState = freshLoginState({ state: '' as never })
    getLoginStateMock.mockResolvedValue(loginState)
    getSessionMock.mockResolvedValue(freshPriorSession())
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(emittedSecurityEvents()[0].event).toBe('auth.login.failed')
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('state_missing')
    expect(loginState.destroy).toHaveBeenCalledOnce()
  })

  it('emits auth.login.failed with reason=nonce_missing', async () => {
    const loginState = freshLoginState({ nonce: '' as never })
    getLoginStateMock.mockResolvedValue(loginState)
    getSessionMock.mockResolvedValue(freshPriorSession())
    const GET = await importGet()
    await GET(buildCallbackRequest())
    expect(
      (emittedSecurityEvents()[0].detail as Record<string, unknown>).reason,
    ).toBe('nonce_missing')
    expect(loginState.destroy).toHaveBeenCalledOnce()
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

  it('redirects browser claim failures to the configured public auth error origin', async () => {
    process.env.AUTH_OIDC_REDIRECT_URI =
      'https://kravhantering.example.internal/api/auth/callback'
    resetAuthConfigForTests()
    const loginState = freshLoginState()
    getLoginStateMock.mockResolvedValue(loginState)
    getSessionMock.mockResolvedValue(freshPriorSession())
    const { employeeHsaId, ...rest } = SUCCESS_CLAIMS
    void employeeHsaId
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => rest,
      expiresIn: () => 3600,
      id_token: 'idt',
    })

    const GET = await importGet()
    const response = await GET(
      buildCallbackRequest(
        'https://0.0.0.0:3000/api/auth/callback?code=abc&state=state',
        {
          accept: 'text/html',
          secFetchDest: 'document',
        },
      ),
    )

    expect(loginState.destroy).toHaveBeenCalledOnce()
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      'https://kravhantering.example.internal/auth/error?code=hsa_id_missing&locale=sv',
    )
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
      hsaId: 'SE5560000001-rev1',
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

  it('does NOT emit auth.roles.changed when the prior session belongs to a different user', async () => {
    getLoginStateMock.mockResolvedValue(freshLoginState())
    getSessionMock.mockResolvedValue(
      freshPriorSession({ sub: 'user-2', roles: ['Reviewer'] }),
    )
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
    expect(emittedSecurityEvents()).toContainEqual(
      expect.objectContaining({
        event: 'auth.login.succeeded',
        detail: {
          estimatedCookieLength: 4097,
          logoutHintOmitted: true,
          roles: ['Reviewer'],
          safeLimit: 3800,
        },
      }),
    )
  })
})
