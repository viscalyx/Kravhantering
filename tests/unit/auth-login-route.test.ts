import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  buildAuthorizationUrl: vi.fn(),
  calculatePKCECodeChallenge: vi.fn(),
  getLoginState: vi.fn(),
  getOidcConfiguration: vi.fn(),
  randomNonce: vi.fn(),
  randomPKCECodeVerifier: vi.fn(),
  randomState: vi.fn(),
}))

vi.mock('@/i18n/routing', () => ({
  routing: { defaultLocale: 'sv', locales: ['sv', 'en'] },
}))

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => ({
    redirectUri: 'https://app.example.test/api/auth/callback',
    scopes: 'openid profile email',
  }),
}))

vi.mock('@/lib/auth/login-state', () => ({
  getLoginState: authState.getLoginState,
}))

vi.mock('@/lib/auth/oidc', () => ({
  getOidcConfiguration: authState.getOidcConfiguration,
  oidcClient: {
    buildAuthorizationUrl: authState.buildAuthorizationUrl,
    calculatePKCECodeChallenge: authState.calculatePKCECodeChallenge,
    randomNonce: authState.randomNonce,
    randomPKCECodeVerifier: authState.randomPKCECodeVerifier,
    randomState: authState.randomState,
  },
}))

import { GET } from '@/app/api/auth/login/route'

describe('auth login route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.randomPKCECodeVerifier.mockReturnValue('verifier')
    authState.calculatePKCECodeChallenge.mockResolvedValue('challenge')
    authState.randomState.mockReturnValue('state')
    authState.randomNonce.mockReturnValue('nonce')
    authState.getOidcConfiguration.mockResolvedValue({ discovered: true })
    authState.buildAuthorizationUrl.mockReturnValue(
      new URL('https://issuer.example.test/authorize?request=1'),
    )
  })

  it('rejects malformed query parameters before creating login state', async () => {
    const response = await GET(
      new NextRequest('https://app.example.test/api/auth/login?unexpected=1'),
    )

    expect(response.status).toBe(400)
    expect(authState.getLoginState).not.toHaveBeenCalled()
  })

  it.each([
    [undefined, '/sv'],
    ['', '/sv'],
    ['https://evil.example/path', '/sv'],
    ['//evil.example/path', '/sv'],
    ['/sv\\requirements', '/sv'],
    [`/sv\0requirements`, '/sv'],
    ['/requirements', '/sv'],
    ['/', '/'],
    ['/sv', '/sv'],
    ['/en/requirements?tab=open#row-2', '/en/requirements?tab=open#row-2'],
  ])('sanitizes returnTo %s to %s', async (returnTo, expected) => {
    const loginState = { save: vi.fn() } as Record<string, unknown> & {
      save: ReturnType<typeof vi.fn>
    }
    authState.getLoginState.mockResolvedValue(loginState)

    const url = new URL('https://app.example.test/api/auth/login')
    if (returnTo !== undefined) url.searchParams.set('returnTo', returnTo)
    const response = await GET(new NextRequest(url))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      'https://issuer.example.test/authorize?request=1',
    )
    expect(loginState).toMatchObject({
      codeVerifier: 'verifier',
      nonce: 'nonce',
      returnTo: expected,
      state: 'state',
    })
    expect(loginState.issuedAt).toEqual(expect.any(Number))
    expect(loginState.save).toHaveBeenCalledOnce()
    expect(authState.buildAuthorizationUrl).toHaveBeenCalledWith(
      { discovered: true },
      {
        redirect_uri: 'https://app.example.test/api/auth/callback',
        scope: 'openid profile email',
        state: 'state',
        nonce: 'nonce',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
      },
    )
  })
})
