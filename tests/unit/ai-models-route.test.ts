import { describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/ai/models/route'

vi.mock('@/lib/ai/openrouter-client', () => ({
  listModels: vi.fn(),
}))

function makeRequest(url = 'http://localhost:3000/api/ai/models') {
  return {
    nextUrl: new URL(url),
  } as Parameters<typeof GET>[0]
}

describe('GET /api/ai/models', () => {
  it('returns models enriched with structured_outputs flag', async () => {
    const { listModels } = await import('@/lib/ai/openrouter-client')
    const claudeModel = {
      contextLength: 200000,
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4',
      pricing: {
        completion: '0.000015',
        prompt: '0.000003',
        reasoning: '0.000015',
      },
      provider: 'anthropic',
      supportedParameters: ['reasoning', 'stream', 'response_format'],
    }
    // First call: base list; second call: structured_outputs subset
    vi.mocked(listModels)
      .mockResolvedValueOnce([claudeModel])
      .mockResolvedValueOnce([claudeModel])

    const response = await GET(makeRequest())
    const data = (await response.json()) as {
      models: { id: string; supportedParameters: string[] }[]
    }

    expect(data.models).toHaveLength(1)
    expect(data.models[0].id).toBe('anthropic/claude-sonnet-4')
    expect(data.models[0].supportedParameters).toContain('structured_outputs')
  })

  it('does not add structured_outputs when model is not in structured subset', async () => {
    const { listModels } = await import('@/lib/ai/openrouter-client')
    const glmModel = {
      contextLength: 128000,
      id: 'zhipu/glm-4.5-air',
      name: 'GLM 4.5 Air',
      pricing: { completion: '0', prompt: '0', reasoning: '0' },
      provider: 'zhipu',
      supportedParameters: ['reasoning', 'stream'],
    }
    // Base list has the model, structured subset does not
    vi.mocked(listModels)
      .mockResolvedValueOnce([glmModel])
      .mockResolvedValueOnce([])

    const response = await GET(
      makeRequest('http://localhost:3000/api/ai/models?refresh=1'),
    )
    const data = (await response.json()) as {
      models: { id: string; supportedParameters: string[] }[]
    }

    expect(data.models).toHaveLength(1)
    expect(data.models[0].supportedParameters).not.toContain(
      'structured_outputs',
    )
  })

  it('returns error when OpenRouter is unavailable', async () => {
    const { listModels } = await import('@/lib/ai/openrouter-client')
    vi.mocked(listModels)
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockRejectedValueOnce(new Error('Connection refused'))

    const response = await GET(
      makeRequest('http://localhost:3000/api/ai/models?refresh=1'),
    )

    const data = (await response.json()) as { models: unknown[]; error: string }
    expect(data.models).toEqual([])
    expect(data.error).toBe('Connection refused')
  })

  it('passes supported_parameters and adds structured_outputs filter', async () => {
    const { listModels } = await import('@/lib/ai/openrouter-client')
    vi.mocked(listModels).mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await GET(
      makeRequest(
        'http://localhost:3000/api/ai/models?supported_parameters=tools',
      ),
    )

    // First call: base list with requested params
    expect(listModels).toHaveBeenCalledWith(['tools'])
    // Second call: same params plus structured_outputs
    expect(listModels).toHaveBeenCalledWith(['tools', 'structured_outputs'])
  })
})
