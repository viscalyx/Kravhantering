import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAiModelsCacheForTests, GET } from '@/app/api/ai/models/route'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { attachVerifiedActor } from '@/lib/requirements/auth'

vi.mock('@/lib/ai/openrouter-client', () => ({
  listModels: vi.fn(),
}))

function makeRequest(url = 'http://localhost:3000/api/ai/models') {
  const request = new NextRequest(url, {
    headers: {
      'x-correlation-id': 'workflow-models',
      'x-request-id': 'request-models',
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

describe('GET /api/ai/models', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAiModelsCacheForTests()
    clearInMemoryThrottleForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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

  it('filters vision support locally after enriching model modality', async () => {
    const { listModels } = await import('@/lib/ai/openrouter-client')
    const visionModel = {
      contextLength: 200000,
      id: 'openai/gpt-5-vision',
      modality: 'text+image->text',
      name: 'GPT-5 Vision',
      pricing: { completion: '0', prompt: '0', reasoning: '0' },
      provider: 'openai',
      supportedParameters: ['reasoning', 'stream'],
    }
    const textModel = {
      contextLength: 128000,
      id: 'openai/gpt-5-text',
      modality: 'text->text',
      name: 'GPT-5 Text',
      pricing: { completion: '0', prompt: '0', reasoning: '0' },
      provider: 'openai',
      supportedParameters: ['reasoning', 'stream'],
    }
    vi.mocked(listModels)
      .mockResolvedValueOnce([visionModel, textModel])
      .mockResolvedValueOnce([])

    const response = await GET(
      makeRequest(
        'http://localhost:3000/api/ai/models?supported_parameters=vision',
      ),
    )
    const data = (await response.json()) as {
      models: { id: string; supportedParameters: string[] }[]
    }

    expect(listModels).toHaveBeenNthCalledWith(1, undefined)
    expect(listModels).toHaveBeenNthCalledWith(2, ['structured_outputs'])
    expect(data.models).toHaveLength(1)
    expect(data.models[0].id).toBe('openai/gpt-5-vision')
    expect(data.models[0].supportedParameters).toContain('vision')
  })

  it('returns sanitized error when OpenRouter is unavailable', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const { listModels } = await import('@/lib/ai/openrouter-client')
    vi.mocked(listModels)
      .mockRejectedValueOnce(
        new Error('Connection refused: sk-or-v1-secret SELECT token FROM keys'),
      )
      .mockRejectedValueOnce(
        new Error('Connection refused: sk-or-v1-secret SELECT token FROM keys'),
      )

    try {
      const response = await GET(
        makeRequest('http://localhost:3000/api/ai/models?refresh=1'),
      )

      expect(response.status).toBe(503)
      const data = (await response.json()) as {
        models: unknown[]
        error: string
      }
      expect(data.models).toEqual([])
      expect(data.error).toBe('AI provider is unavailable')
      expect(JSON.stringify(data)).not.toMatch(/sk-or-v1|SELECT/)
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toMatch(
        /sk-or-v1-secret|SELECT token/,
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
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

  it('throttles repeated refresh requests', async () => {
    const { listModels } = await import('@/lib/ai/openrouter-client')
    vi.mocked(listModels).mockResolvedValue([])

    for (let index = 0; index < 10; index += 1) {
      const response = await GET(
        makeRequest('http://localhost:3000/api/ai/models?refresh=1'),
      )
      expect(response.status).toBe(200)
    }

    const response = await GET(
      makeRequest('http://localhost:3000/api/ai/models?refresh=1'),
    )
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeTruthy()
    expect(body.error).toContain('Too many AI model refresh requests')
  })

  it('throttles repeated cache misses from varying supported parameters', async () => {
    const { listModels } = await import('@/lib/ai/openrouter-client')
    vi.mocked(listModels).mockResolvedValue([])

    for (let index = 0; index < 10; index += 1) {
      const response = await GET(
        makeRequest(
          `http://localhost:3000/api/ai/models?supported_parameters=param-${index}`,
        ),
      )
      expect(response.status).toBe(200)
    }

    const response = await GET(
      makeRequest(
        'http://localhost:3000/api/ai/models?supported_parameters=param-10',
      ),
    )
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeTruthy()
    expect(body.error).toContain('Too many AI model requests')
    expect(listModels).toHaveBeenCalledTimes(20)
  })

  it('evicts the oldest model cache entry when the bounded cache is full', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T12:00:00.000Z'))
    const { listModels } = await import('@/lib/ai/openrouter-client')
    vi.mocked(listModels).mockResolvedValue([])

    for (let index = 0; index < 33; index += 1) {
      if (index > 0 && index % 10 === 0) {
        vi.advanceTimersByTime(60_001)
      }
      const response = await GET(
        makeRequest(
          `http://localhost:3000/api/ai/models?supported_parameters=cache-${index}`,
        ),
      )
      expect(response.status).toBe(200)
    }

    vi.advanceTimersByTime(60_001)
    const callsBeforeRepeat = vi.mocked(listModels).mock.calls.length
    const response = await GET(
      makeRequest(
        'http://localhost:3000/api/ai/models?supported_parameters=cache-0',
      ),
    )

    expect(response.status).toBe(200)
    expect(listModels).toHaveBeenCalledTimes(callsBeforeRepeat + 2)
  })
})
