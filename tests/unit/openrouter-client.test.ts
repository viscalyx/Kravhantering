import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateChat,
  generateChatStream,
  getKeyInfo,
  listModels,
} from '@/lib/ai/openrouter-client'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-test-key')
  vi.stubEnv('NEXT_PUBLIC_DEFAULT_MODEL', 'anthropic/claude-sonnet-4')
  delete process.env.OPENROUTER_MGMT_API_KEY
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generateChat (non-streaming)', () => {
  it('sends correct request to OpenRouter', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"requirements":[]}',
              reasoning: 'I analyzed the topic...',
            },
          },
        ],
        usage: {
          completion_tokens: 100,
          completion_tokens_details: { reasoning_tokens: 40 },
          cost: 0.0025,
          prompt_tokens: 50,
        },
      }),
      ok: true,
    })

    const result = await generateChat<{ requirements: unknown[] }>({
      messages: [
        { content: 'You are an expert', role: 'system' },
        { content: 'Generate requirements', role: 'user' },
      ],
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-or-v1-test-key',
          'Content-Type': 'application/json',
        },
      }),
    )

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.model).toBe('anthropic/claude-sonnet-4')
    expect(body.stream).toBe(false)
    expect(body.reasoning).toEqual({ effort: 'high' })
    expect(body.messages).toHaveLength(2)

    expect(result.thinking).toBe('I analyzed the topic...')
    expect(result.content).toEqual({ requirements: [] })
    expect(result.stats.completionTokens).toBe(100)
    expect(result.stats.reasoningTokens).toBe(40)
    expect(result.stats.cost).toBe(0.0025)
  })

  it('uses custom model when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        choices: [{ message: { content: '{"requirements":[]}' } }],
      }),
      ok: true,
    })

    await generateChat({ messages: [], model: 'google/gemini-2.5-flash' })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.model).toBe('google/gemini-2.5-flash')
  })

  it('sends json_schema response_format when supportedParameters is undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        choices: [{ message: { content: '{"requirements":[]}' } }],
      }),
      ok: true,
    })

    await generateChat({
      format: {
        properties: { requirements: { type: 'array' } },
        type: 'object',
      },
      messages: [],
    })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.response_format).toEqual({
      json_schema: {
        name: 'requirements',
        schema: {
          properties: { requirements: { type: 'array' } },
          type: 'object',
        },
        strict: true,
      },
      type: 'json_schema',
    })
  })

  it('sends json_schema when model supports structured_outputs', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        choices: [{ message: { content: '{"requirements":[]}' } }],
      }),
      ok: true,
    })

    await generateChat({
      format: {
        properties: { requirements: { type: 'array' } },
        type: 'object',
      },
      messages: [],
      supportedParameters: ['reasoning', 'stream', 'structured_outputs'],
    })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.response_format.type).toBe('json_schema')
  })

  it('sends json_object when model supports response_format but not structured_outputs', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        choices: [{ message: { content: '{"requirements":[]}' } }],
      }),
      ok: true,
    })

    await generateChat({
      format: {
        properties: { requirements: { type: 'array' } },
        type: 'object',
      },
      messages: [],
      supportedParameters: ['reasoning', 'stream', 'response_format'],
    })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('sends json_schema when supportedParameters is undefined (MCP callers)', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        choices: [{ message: { content: '{"requirements":[]}' } }],
      }),
      ok: true,
    })

    await generateChat({
      format: {
        properties: { requirements: { type: 'array' } },
        type: 'object',
      },
      messages: [],
      // supportedParameters intentionally omitted
    })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.response_format.type).toBe('json_schema')
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    })

    await expect(generateChat({ messages: [] })).rejects.toThrow(
      'OpenRouter request failed (500)',
    )
  })

  it('throws on invalid JSON content', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        choices: [{ message: { content: 'not json' } }],
      }),
      ok: true,
    })

    await expect(generateChat({ messages: [] })).rejects.toThrow(
      'Failed to parse OpenRouter JSON response',
    )
  })

  it('throws when API key is missing', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')

    await expect(generateChat({ messages: [] })).rejects.toThrow(
      'OPENROUTER_API_KEY environment variable is not set',
    )
  })

  it('handles abort signal', async () => {
    const ac = new AbortController()
    ac.abort()

    mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))

    await expect(
      generateChat({ messages: [], signal: ac.signal }),
    ).rejects.toThrow()
  })
})

describe('generateChatStream', () => {
  it('yields thinking and generating events', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"reasoning":"Let me "}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning":"think..."}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"{\\"req"}}]}\n\n',
      // cspell:disable-next-line
      'data: {"choices":[{"delta":{"content":"uirements\\":[]}"}}]}\n\n',
      'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":50,"completion_tokens":100,"completion_tokens_details":{"reasoning_tokens":40},"cost":0.003}}\n\n',
      'data: [DONE]\n\n',
    ]

    let lineIndex = 0
    const mockReader = {
      read: async () => {
        if (lineIndex >= sseLines.length) {
          return { done: true, value: undefined }
        }
        const value = new TextEncoder().encode(sseLines[lineIndex++])
        return { done: false, value }
      },
      releaseLock: vi.fn(),
    }

    mockFetch.mockResolvedValueOnce({
      body: { getReader: () => mockReader },
      ok: true,
    })

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events).toEqual([
      { chunk: 'Let me ', phase: 'thinking', thinkingSoFar: 'Let me ' },
      {
        chunk: 'think...',
        phase: 'thinking',
        thinkingSoFar: 'Let me think...',
      },
      { chunk: '{"req', phase: 'generating' },
      // cspell:disable-next-line
      { chunk: 'uirements":[]}', phase: 'generating' },
      {
        phase: 'done',
        rawContent: '{"requirements":[]}',
        stats: {
          completionTokens: 100,
          cost: 0.003,
          promptTokens: 50,
          reasoningTokens: 40,
          totalTokens: 150,
        },
        thinking: 'Let me think...',
      },
    ])
  })

  it('yields error on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    })

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events).toHaveLength(1)
    expect(events[0].phase).toBe('error')
  })

  it('skips SSE comment lines', async () => {
    const sseLines = [
      ': OPENROUTER PROCESSING\n\n',
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
      'data: [DONE]\n\n',
    ]

    let lineIndex = 0
    const mockReader = {
      read: async () => {
        if (lineIndex >= sseLines.length) {
          return { done: true, value: undefined }
        }
        const value = new TextEncoder().encode(sseLines[lineIndex++])
        return { done: false, value }
      },
      releaseLock: vi.fn(),
    }

    mockFetch.mockResolvedValueOnce({
      body: { getReader: () => mockReader },
      ok: true,
    })

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    // Should have generating + done events (comment skipped)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ chunk: 'hello', phase: 'generating' })
    expect(events[1].phase).toBe('done')
  })
})

describe('listModels', () => {
  it('returns models from OpenRouter', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        data: [
          {
            context_length: 200000,
            id: 'anthropic/claude-sonnet-4',
            name: 'Claude Sonnet 4',
            pricing: {
              completion: '0.000015',
              prompt: '0.000003',
              reasoning: '0.000015',
            },
            supported_parameters: ['reasoning', 'stream', 'structured_outputs'],
          },
          {
            context_length: 1000000,
            id: 'google/gemini-2.5-flash',
            name: 'Gemini 2.5 Flash',
            pricing: { completion: '0.0000025', prompt: '0.00000015' },
            supported_parameters: ['reasoning', 'stream'],
          },
        ],
      }),
      ok: true,
    })

    const models = await listModels()
    expect(models).toHaveLength(2)
    expect(models[0].id).toBe('anthropic/claude-sonnet-4')
    expect(models[0].provider).toBe('anthropic')
    expect(models[0].pricing.prompt).toBe('0.000003')
    expect(models[1].id).toBe('google/gemini-2.5-flash')
    expect(models[1].provider).toBe('google')
  })

  it('passes supported_parameters filter', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ data: [] }),
      ok: true,
    })

    await listModels(['structured_outputs'])

    const calledUrl = mockFetch.mock.calls[0][0] as string
    /* cspell:disable */
    expect(calledUrl).toContain(
      'supported_parameters=reasoning%2Cstream%2Cresponse_format%2Cstructured_outputs',
    )
    /* cspell:enable */
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(listModels()).rejects.toThrow(
      'Failed to list OpenRouter models',
    )
  })
})

describe('getKeyInfo', () => {
  it('returns credit info with org credits when mgmt key is set', async () => {
    vi.stubEnv('OPENROUTER_MGMT_API_KEY', 'sk-or-mgmt-test-key')
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({
          data: { total_credits: 10, total_usage: 0.13 },
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            is_free_tier: false,
            limit: 50,
            limit_remaining: 37.5,
            usage: 12.5,
            usage_daily: 2.3,
          },
        }),
        ok: true,
      })

    const info = await getKeyInfo()
    expect(info.isFreeTier).toBe(false)
    expect(info.limit).toBe(50)
    expect(info.limitRemaining).toBe(37.5)
    expect(info.usage).toBe(12.5)
    expect(info.usageDaily).toBe(2.3)
    expect(info.totalCredits).toBeCloseTo(9.87)
    expect(info.managementKeyMissing).toBe(false)

    // Credits call should use the management key
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const creditsCall = mockFetch.mock.calls[0]
    expect(creditsCall[0]).toContain('/credits')
    expect(creditsCall[1].headers.Authorization).toBe(
      'Bearer sk-or-mgmt-test-key',
    )
  })

  it('returns null totalCredits when mgmt key credits endpoint fails', async () => {
    vi.stubEnv('OPENROUTER_MGMT_API_KEY', 'sk-or-mgmt-test-key')
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            is_free_tier: true,
            limit: null,
            limit_remaining: null,
            usage: 0,
            usage_daily: 0,
          },
        }),
        ok: true,
      })

    const info = await getKeyInfo()
    expect(info.isFreeTier).toBe(true)
    expect(info.totalCredits).toBeNull()
    expect(info.managementKeyMissing).toBe(false)
  })

  it('skips credits fetch and flags managementKeyMissing when mgmt key is not set', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        data: {
          is_free_tier: false,
          limit: 10,
          limit_remaining: 8,
          usage: 2,
          usage_daily: 0.5,
        },
      }),
      ok: true,
    })

    const info = await getKeyInfo()
    expect(info.managementKeyMissing).toBe(true)
    expect(info.totalCredits).toBeNull()
    // Only the key endpoint should be called
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain('/key')
  })

  it('throws on non-OK key response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    await expect(getKeyInfo()).rejects.toThrow(
      'Failed to get OpenRouter key info (401)',
    )
  })
})
