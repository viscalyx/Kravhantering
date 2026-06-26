import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/ai/credits/route'
import * as actionAudit from '@/lib/audit/action-audit'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import * as requirementsAuth from '@/lib/requirements/auth'

const createDefaultAuthorizationServiceSpy = vi.spyOn(
  requirementsAuth,
  'createDefaultAuthorizationService',
)
const recordDeniedActionAuditEventSpy = vi.spyOn(
  actionAudit,
  'recordDeniedActionAuditEvent',
)

const dbState = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: dbState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/ai/openrouter-client', () => ({
  getKeyInfo: vi.fn(),
}))

function makeRequest(
  roles: string[] = ['Admin'],
  isAuthenticated = true,
  url = 'http://localhost:3000/api/ai/credits',
): Request {
  const request = new Request(url, {
    headers: {
      'x-correlation-id': 'workflow-credits',
      'x-request-id': 'request-credits',
    },
  })
  requirementsAuth.attachVerifiedActor(request, {
    displayName: 'AI User',
    hsaId: isAuthenticated ? 'SE5560000001-ai1' : null,
    id: isAuthenticated ? 'ai-user' : null,
    isAuthenticated,
    roles,
    source: isAuthenticated ? 'oidc' : 'anonymous',
  })
  return request
}

function expectNoAuthorizationSideEffects() {
  expect(createDefaultAuthorizationServiceSpy).not.toHaveBeenCalled()
  expect(recordDeniedActionAuditEventSpy).not.toHaveBeenCalled()
  expect(dbState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  expect(dbState.query).not.toHaveBeenCalled()
  expect(dbState.transaction).not.toHaveBeenCalled()
}

describe('GET /api/ai/credits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInMemoryThrottleForTests()
    dbState.getRequestSqlServerDataSource.mockResolvedValue({
      query: dbState.query,
      transaction: dbState.transaction,
    })
    dbState.query.mockResolvedValue([])
    dbState.transaction.mockImplementation(
      async (callback: (manager: { query: typeof dbState.query }) => unknown) =>
        callback({ query: dbState.query }),
    )
  })

  it('returns key info on success', async () => {
    const { getKeyInfo } = await import('@/lib/ai/openrouter-client')
    vi.mocked(getKeyInfo).mockResolvedValueOnce({
      isFreeTier: false,
      limit: 50,
      limitRemaining: 37,
      managementKeyMissing: false,
      totalCredits: 10,
      usage: 13,
      usageDaily: 2,
    })

    const response = await GET(makeRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      limit: 50,
      totalCredits: 10,
    })
    expectNoAuthorizationSideEffects()
  })

  it('allows credit lookup for authenticated actors without an AI generation scope', async () => {
    const { getKeyInfo } = await import('@/lib/ai/openrouter-client')
    vi.mocked(getKeyInfo).mockResolvedValueOnce({
      isFreeTier: false,
      limit: 50,
      limitRemaining: 37,
      managementKeyMissing: false,
      totalCredits: 10,
      usage: 13,
      usageDaily: 2,
    })

    const response = await GET(makeRequest([]))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      limit: 50,
      totalCredits: 10,
    })
    expect(getKeyInfo).toHaveBeenCalled()
    expectNoAuthorizationSideEffects()
  })

  it('denies anonymous credit lookup before calling OpenRouter', async () => {
    const { getKeyInfo } = await import('@/lib/ai/openrouter-client')

    const response = await GET(makeRequest([], false))
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(401)
    expect(body.error).toBe('Authentication is required')
    expect(getKeyInfo).not.toHaveBeenCalled()
    expectNoAuthorizationSideEffects()
  })

  it('returns sanitized provider errors', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const { getKeyInfo } = await import('@/lib/ai/openrouter-client')
    vi.mocked(getKeyInfo).mockRejectedValueOnce(
      new Error('Failed to get OpenRouter key info (401): sk-or-v1-secret'),
    )

    try {
      const response = await GET(makeRequest())

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        error: 'AI credit information is unavailable',
      })
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
        'sk-or-v1-secret',
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('throttles repeated credit lookups', async () => {
    const { getKeyInfo } = await import('@/lib/ai/openrouter-client')
    vi.mocked(getKeyInfo).mockResolvedValue({
      isFreeTier: false,
      limit: 50,
      limitRemaining: 37,
      managementKeyMissing: false,
      totalCredits: 10,
      usage: 13,
      usageDaily: 2,
    })

    for (let index = 0; index < 20; index += 1) {
      expect((await GET(makeRequest())).status).toBe(200)
    }

    const response = await GET(makeRequest())
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeTruthy()
    expect(body.error).toContain('Too many AI credit requests')
  })
})
