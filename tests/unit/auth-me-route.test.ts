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
})
