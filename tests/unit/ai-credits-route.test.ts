import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/ai/credits/route'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { attachVerifiedActor } from '@/lib/requirements/auth'

vi.mock('@/lib/ai/openrouter-client', () => ({
  getKeyInfo: vi.fn(),
}))

function makeRequest(): Request {
  const request = new Request('http://localhost:3000/api/ai/credits', {
    headers: {
      'x-correlation-id': 'workflow-credits',
      'x-request-id': 'request-credits',
    },
  })
  attachVerifiedActor(request, {
    displayName: 'AI User',
    hsaId: 'SE2321000032-ai1',
    id: 'ai-user',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc',
  })
  return request
}

describe('GET /api/ai/credits', () => {
  beforeEach(() => {
    clearInMemoryThrottleForTests()
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
