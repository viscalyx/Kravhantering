import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthConfigMock = vi.fn()
const assertSameOriginRequestMock = vi.fn()
const getSessionFromRequestMock = vi.fn()
const isSignedInMock = vi.fn()

vi.mock('@/lib/auth/config', () => ({
  getAuthConfig: () => getAuthConfigMock(),
}))

vi.mock('@/lib/auth/csrf', () => ({
  assertSameOriginRequest: (...args: unknown[]) =>
    assertSameOriginRequestMock(...args),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionFromRequest: (...args: unknown[]) =>
    getSessionFromRequestMock(...args),
  isSignedIn: (...args: unknown[]) => isSignedInMock(...args),
}))

describe('requirements auth session failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuthConfigMock.mockReturnValue({ enabled: true })
    assertSameOriginRequestMock.mockReturnValue(undefined)
  })

  it('rethrows session resolution failures instead of falling back to anonymous', async () => {
    getSessionFromRequestMock.mockRejectedValue(
      new Error('session read failed'),
    )
    isSignedInMock.mockReturnValue(false)

    const { createRequestContext } = await import('@/lib/requirements/auth')

    await expect(
      createRequestContext(
        new Request('http://localhost/api/requirements'),
        'rest',
      ),
    ).rejects.toThrow('session read failed')
  })
})
