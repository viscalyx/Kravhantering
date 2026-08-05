import { beforeEach, describe, expect, it, vi } from 'vitest'

const contextMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  isSignedIn: vi.fn(),
  resolveRequestCorrelationIds: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: contextMocks.headers }))
vi.mock('@/lib/auth/session', () => ({
  getSession: contextMocks.getSession,
  isSignedIn: contextMocks.isSignedIn,
}))
vi.mock('@/lib/observability/request-ids', () => ({
  resolveRequestCorrelationIds: contextMocks.resolveRequestCorrelationIds,
}))

import { createServerComponentRequestContext } from '@/lib/requirements/server-component-context'

describe('createServerComponentRequestContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contextMocks.headers.mockResolvedValue(new Headers())
    contextMocks.getSession.mockResolvedValue({})
    contextMocks.isSignedIn.mockReturnValue(false)
    contextMocks.resolveRequestCorrelationIds.mockReturnValue({
      correlationId: 'correlation-1',
      requestId: 'request-1',
    })
  })

  it('creates an anonymous GET context without an absent user agent', async () => {
    await expect(
      createServerComponentRequestContext({ path: '/sv/requirements' }),
    ).resolves.toEqual({
      actor: {
        displayName: '',
        hsaId: null,
        id: null,
        isAuthenticated: false,
        roles: [],
        source: 'anonymous',
      },
      correlationId: 'correlation-1',
      request: {
        method: 'GET',
        path: '/sv/requirements',
        requestId: 'request-1',
      },
      requestId: 'request-1',
      source: 'rest',
    })
  })

  it('projects a signed-in actor and request metadata', async () => {
    const session = {
      hsaId: 'SE1234567890-AB',
      name: 'Ada Admin',
      roles: ['Admin', 'User'],
      sub: 'ada',
    }
    contextMocks.headers.mockResolvedValue(
      new Headers({ 'user-agent': 'coverage-agent' }),
    )
    contextMocks.getSession.mockResolvedValue(session)
    contextMocks.isSignedIn.mockReturnValue(true)

    const result = await createServerComponentRequestContext({
      method: 'HEAD',
      path: '/en/requirements/42',
    })

    expect(result.actor).toEqual({
      displayName: 'Ada Admin',
      hsaId: 'SE1234567890-AB',
      id: 'ada',
      isAuthenticated: true,
      roles: ['Admin', 'User'],
      source: 'oidc',
    })
    expect(result.request).toEqual({
      method: 'HEAD',
      path: '/en/requirements/42',
      requestId: 'request-1',
      userAgent: 'coverage-agent',
    })
  })
})
