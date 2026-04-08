import { describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/ai/models/route'

vi.mock('@/lib/ai/ollama-client', () => ({
  listModels: vi.fn(),
}))

describe('GET /api/ai/models', () => {
  it('returns models from Ollama', async () => {
    const { listModels } = await import('@/lib/ai/ollama-client')
    vi.mocked(listModels).mockResolvedValueOnce([
      {
        name: 'qwen3:14b',
        parameter_size: '14B',
        quantization_level: 'Q4_K_M',
        size: 9300000000,
      },
    ])

    const response = await GET()
    const data = (await response.json()) as { models: { name: string }[] }

    expect(data.models).toHaveLength(1)
    expect(data.models[0].name).toBe('qwen3:14b')
  })

  it('returns 503 when Ollama is unavailable', async () => {
    const { listModels } = await import('@/lib/ai/ollama-client')
    vi.mocked(listModels).mockRejectedValueOnce(new Error('Connection refused'))

    const response = await GET()
    expect(response.status).toBe(503)

    const data = (await response.json()) as { models: unknown[]; error: string }
    expect(data.models).toEqual([])
    expect(data.error).toBe('Ollama is not available')
  })
})
