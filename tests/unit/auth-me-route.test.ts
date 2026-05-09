import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSessionMock = vi.fn()
const isSignedInMock = vi.fn()

vi.mock('@/lib/auth/session', () => ({
  getSession: () => getSessionMock(),
  isSignedIn: (...args: unknown[]) => isSignedInMock(...args),
}))

import { GET } from '@/app/api/auth/me/route'

describe('auth me route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns unauthenticated responses with no-store caching', async () => {
    getSessionMock.mockResolvedValue({})
    isSignedInMock.mockReturnValue(false)

    const response = await GET()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ authenticated: false })
  })

  it('returns authenticated responses with no-store caching', async () => {
    getSessionMock.mockResolvedValue({
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
      givenName: 'Alice',
      familyName: 'Reviewer',
      name: 'Alice Reviewer',
      email: 'alice@example.test',
      roles: ['Reviewer'],
      accessTokenExpiresAt: 123,
    })
    isSignedInMock.mockReturnValue(true)

    const response = await GET()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      authenticated: true,
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
      givenName: 'Alice',
      familyName: 'Reviewer',
      name: 'Alice Reviewer',
      email: 'alice@example.test',
      roles: ['Reviewer'],
      expiresAt: 123,
    })
  })

  it('never returns raw tokens or login-state secrets from the session', async () => {
    getSessionMock.mockResolvedValue({
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
      givenName: 'Alice',
      familyName: 'Reviewer',
      name: 'Alice Reviewer',
      email: 'alice@example.test',
      roles: ['Reviewer'],
      accessTokenExpiresAt: 123,
      accessToken: 'raw-access-token',
      authorizationCode: 'raw-code',
      code: 'raw-code-alias',
      codeVerifier: 'raw-code-verifier',
      idToken: 'raw-id-token',
      nonce: 'raw-nonce',
      refreshToken: 'raw-refresh-token',
      state: 'raw-state',
    })
    isSignedInMock.mockReturnValue(true)

    const response = await GET()
    const body = (await response.json()) as Record<string, unknown>

    expect(body).toEqual({
      authenticated: true,
      sub: 'user-1',
      hsaId: 'SE2321000032-rev1',
      givenName: 'Alice',
      familyName: 'Reviewer',
      name: 'Alice Reviewer',
      email: 'alice@example.test',
      roles: ['Reviewer'],
      expiresAt: 123,
    })
    expect(JSON.stringify(body)).not.toMatch(
      /raw-access-token|raw-id-token|raw-refresh-token|raw-code|raw-code-verifier|raw-state|raw-nonce/,
    )
  })
})
