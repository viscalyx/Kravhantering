import { describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/ai/credits/route'

vi.mock('@/lib/ai/openrouter-client', () => ({
  getKeyInfo: vi.fn(),
}))

describe('GET /api/ai/credits', () => {
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

    const response = await GET()

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
      const response = await GET()

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
})
