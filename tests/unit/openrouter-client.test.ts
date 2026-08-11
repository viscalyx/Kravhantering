import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AiProviderError,
  generateChat,
  generateChatStream,
  getDefaultModel,
  getKeyInfo,
  listModels,
} from '@/lib/ai/openrouter-client'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return new Response(JSON.stringify(data), { ...init, headers })
}

function streamResponseWithReader(reader: {
  read: () => Promise<unknown>
  releaseLock: () => void
}): Response {
  const response = new Response(new ReadableStream<Uint8Array>(), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
  if (!response.body) throw new Error('Expected response body')
  vi.spyOn(response.body, 'getReader').mockReturnValue(reader as never)
  return response
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-v1-test-key')
  vi.stubEnv('NEXT_PUBLIC_DEFAULT_MODEL', 'anthropic/claude-sonnet-4')
  delete process.env.OPENROUTER_MGMT_API_KEY
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

it('uses the built-in model when no public default is configured', () => {
  vi.stubEnv('NEXT_PUBLIC_DEFAULT_MODEL', '')

  expect(getDefaultModel()).toBe('anthropic/claude-sonnet-4')
})

describe('generateChat (non-streaming)', () => {
  it('uses a stable rate-limit error without retaining provider body data', async () => {
    const providerBody = JSON.stringify({
      error: {
        code: 'provider_rate_limit',
        message:
          'Echo: create payroll for Ada Lovelace ada@example.test with password=unsafe-secret',
      },
    })
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mockFetch.mockResolvedValueOnce(
      new Response(providerBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': 'provider-request-123',
        },
        status: 429,
      }),
    )

    try {
      const rejection = generateChat({
        correlationId: 'correlation-123',
        messages: [{ content: 'sensitive prompt', role: 'user' }],
        requestId: 'request-123',
      })

      await expect(rejection).rejects.toMatchObject({
        code: 'ai_provider_rate_limited',
        message: 'AI provider rate limit reached',
        name: 'AiProviderError',
      })
      await rejection.catch(error => {
        expect(error).toBeInstanceOf(AiProviderError)
        expect(error).not.toHaveProperty('cause')
        expect(JSON.stringify(error)).not.toMatch(
          /Ada Lovelace|ada@example\.test|unsafe-secret|sensitive prompt/,
        )
      })
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toMatch(
        /Ada Lovelace|ada@example\.test|unsafe-secret|sensitive prompt/,
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"channel":"ai-provider-observability"'),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('rejects an unexpected success content type without reading its body', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'Ada ada@example.test password=unsafe-secret',
          ),
        )
        controller.close()
      },
    })
    const getReaderSpy = vi.spyOn(stream, 'getReader')
    mockFetch.mockResolvedValueOnce(
      new Response(stream, {
        headers: { 'Content-Type': 'text/html' },
        status: 200,
      }),
    )

    await expect(generateChat({ messages: [] })).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })
    expect(getReaderSpy).not.toHaveBeenCalled()
  })

  it.each([
    [400, 'ai_provider_configuration_error'],
    [401, 'ai_provider_configuration_error'],
    [403, 'ai_provider_configuration_error'],
    [408, 'ai_provider_timeout'],
    [429, 'ai_provider_rate_limited'],
    [500, 'ai_provider_unavailable'],
    [504, 'ai_provider_timeout'],
  ] as const)('maps upstream status %i to %s', async (status, code) => {
    mockFetch.mockResolvedValueOnce(
      new Response('body must not be read', {
        headers: { 'Content-Type': 'text/plain' },
        status,
      }),
    )

    await expect(generateChat({ messages: [] })).rejects.toMatchObject({ code })
  })

  it('stops reading an oversized provider error body at 16 KiB', async () => {
    const cancel = vi.fn(() => {
      throw new Error('cancel failure must be ignored')
    })
    const chunk = new TextEncoder().encode('x'.repeat(10 * 1024))
    let reads = 0
    const stream = new ReadableStream<Uint8Array>({
      cancel,
      pull(controller) {
        reads += 1
        controller.enqueue(chunk)
      },
    })
    mockFetch.mockResolvedValueOnce(
      new Response(stream, {
        headers: { 'Content-Type': 'application/problem+json' },
        status: 503,
      }),
    )

    await expect(generateChat({ messages: [] })).rejects.toMatchObject({
      code: 'ai_provider_response_too_large',
      metadata: { truncated: true },
    })
    expect(reads).toBeLessThanOrEqual(3)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('classifies provider body read failures without retaining exception text', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(
          new Error('Ada ada@example.test password=body-read-secret'),
        )
      },
    })
    mockFetch.mockResolvedValueOnce(
      new Response(stream, {
        headers: { 'Content-Type': 'application/json' },
        status: 502,
      }),
    )

    try {
      await expect(generateChat({ messages: [] })).rejects.toMatchObject({
        code: 'ai_provider_response_read_failed',
      })
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toMatch(
        /Ada|ada@example\.test|body-read-secret/,
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('stops reading a successful JSON response above 4 MiB', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('x'.repeat(4 * 1024 * 1024 + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(generateChat({ messages: [] })).rejects.toMatchObject({
      code: 'ai_provider_response_too_large',
    })
  })

  it('rejects a missing or malformed bounded JSON body', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{malformed', {
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    await expect(generateChat({ messages: [] })).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })
    await expect(generateChat({ messages: [] })).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })
  })

  it('rejects malformed non-streaming response shapes', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: 42 } }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '{}' } }],
          usage: { completion_tokens: 'many' },
        }),
      )

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(generateChat({ messages: [] })).rejects.toMatchObject({
        code: 'ai_provider_invalid_response',
      })
    }
  })
  it('sends correct request to OpenRouter', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
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
    )

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
    expect(body).not.toHaveProperty('logprobs')
    expect(body).not.toHaveProperty('top_logprobs')
    expect(body.messages).toHaveLength(2)

    expect(result.thinking).toBe('I analyzed the topic...')
    expect(result.content).toEqual({ requirements: [] })
    expect(result.stats.completionTokens).toBe(100)
    expect(result.stats.reasoningTokens).toBe(40)
    expect(result.stats.cost).toBe(0.0025)
  })

  it('reads non-streaming reasoning_details when reasoning is not present', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: '{"requirements":[]}',
              reasoning_details: [
                {
                  text: 'Detailed reasoning.',
                  type: 'reasoning.text',
                },
              ],
            },
          },
        ],
      }),
    )

    const result = await generateChat<{ requirements: unknown[] }>({
      messages: [],
    })

    expect(result.thinking).toBe('Detailed reasoning.')
  })

  it('ignores malformed reasoning details and joins text and summary details', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: '{"requirements":[]}',
              reasoning_details: [
                null,
                { text: 'First. ' },
                { summary: 'Second.' },
                { unknown: true },
              ],
            },
          },
        ],
      }),
    )

    const result = await generateChat<{ requirements: unknown[] }>({
      messages: [{ content: 'Generate', role: 'user' }],
    })

    expect(result.thinking).toBe('First. Second.')
    expect(result.stats).toEqual({
      completionTokens: 0,
      cost: 0,
      promptTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
    })
  })

  it('aborts provider setup when the caller signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    mockFetch.mockImplementationOnce(
      async (_url: string, init: RequestInit) => {
        expect(init.signal?.aborted).toBe(true)
        throw new DOMException('Aborted', 'AbortError')
      },
    )

    await expect(
      generateChat({
        messages: [{ content: 'Generate', role: 'user' }],
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AiProviderCallerCancelledError' })
  })

  it('aborts a pending request after the provider timeout', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementationOnce(
      async (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Timed out', 'AbortError'))
          })
        }),
    )

    const result = generateChat({
      messages: [{ content: 'Generate', role: 'user' }],
    })
    const rejection = expect(result).rejects.toMatchObject({
      code: 'ai_provider_timeout',
    })
    await vi.advanceTimersByTimeAsync(120_000)

    await rejection
  })

  it('forwards a later caller abort to a pending provider request', async () => {
    const controller = new AbortController()
    mockFetch.mockImplementationOnce(
      async (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Caller aborted', 'AbortError'))
          })
        }),
    )

    const result = generateChat({
      messages: [{ content: 'Generate', role: 'user' }],
      signal: controller.signal,
    })
    controller.abort()

    await expect(result).rejects.toMatchObject({
      name: 'AiProviderCallerCancelledError',
    })
  })

  it('uses a stable provider error when an error body is unavailable', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 502 }))

    await expect(
      generateChat({
        messages: [{ content: 'Generate', role: 'user' }],
      }),
    ).rejects.toMatchObject({ code: 'ai_provider_unavailable' })
  })

  it('does not duplicate non-streaming reasoning when reasoning_details is also present', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [
          {
            message: {
              content: '{"requirements":[]}',
              reasoning: 'Detailed reasoning.',
              reasoning_details: [
                {
                  text: 'Detailed reasoning.',
                  type: 'reasoning.text',
                },
              ],
            },
          },
        ],
      }),
    )

    const result = await generateChat<{ requirements: unknown[] }>({
      messages: [],
    })

    expect(result.thinking).toBe('Detailed reasoning.')
  })

  it('uses custom model when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: '{"requirements":[]}' } }],
      }),
    )

    await generateChat({ messages: [], model: 'google/gemini-2.5-flash' })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.model).toBe('google/gemini-2.5-flash')
  })

  it('requires known model capabilities for formatted responses', async () => {
    await expect(
      generateChat({
        format: {
          properties: { requirements: { type: 'array' } },
          type: 'object',
        },
        messages: [],
      }),
    ).rejects.toThrow(
      'OpenRouter model capabilities are required for formatted responses',
    )

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sends json_object when known model capabilities do not include structured_outputs', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: '{"requirements":[]}' } }],
      }),
    )

    await generateChat({
      format: {
        properties: { requirements: { type: 'array' } },
        type: 'object',
      },
      messages: [],
      supportedParameters: [],
    })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('sends json_schema when model supports structured_outputs', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: '{"requirements":[]}' } }],
      }),
    )

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
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: '{"requirements":[]}' } }],
      }),
    )

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

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(generateChat({ messages: [] })).rejects.toMatchObject({
      code: 'ai_provider_unavailable',
    })
  })

  it('throws on invalid JSON content', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        choices: [{ message: { content: 'not json' } }],
      }),
    )

    await expect(generateChat({ messages: [] })).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })
  })

  it('throws when API key is missing', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')

    await expect(generateChat({ messages: [] })).rejects.toMatchObject({
      code: 'ai_provider_configuration_error',
    })
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
  it('rejects an unexpected stream content type without reading the body', async () => {
    const stream = new ReadableStream<Uint8Array>()
    const getReaderSpy = vi.spyOn(stream, 'getReader')
    mockFetch.mockResolvedValueOnce(
      new Response(stream, {
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        code: 'ai_provider_invalid_response',
        message: 'AI provider returned an invalid response',
        phase: 'error',
      },
    ])
    expect(getReaderSpy).not.toHaveBeenCalled()
  })

  it('stops reading an SSE frame above 256 KiB', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(`data: ${'x'.repeat(256 * 1024)}\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events.at(-1)).toMatchObject({
      code: 'ai_provider_response_too_large',
      phase: 'error',
    })
    expect(events).not.toContainEqual(
      expect.objectContaining({ phase: 'done' }),
    )
  })

  it('stops accumulating model content above 4 MiB', async () => {
    const content = 'x'.repeat(240 * 1024)
    const frames = Array.from(
      { length: 18 },
      () =>
        `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
    ).join('')
    mockFetch.mockResolvedValueOnce(
      new Response(frames, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events.at(-1)).toMatchObject({
      code: 'ai_provider_response_too_large',
      phase: 'error',
    })
    expect(events).not.toContainEqual(
      expect.objectContaining({ phase: 'done' }),
    )
  })

  it('fails closed when an SSE response ends without a DONE frame', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events.at(-1)).toMatchObject({
      code: 'ai_provider_invalid_response',
      phase: 'error',
    })
    expect(events).not.toContainEqual(
      expect.objectContaining({ phase: 'done' }),
    )
  })

  it('rejects malformed SSE JSON and payload shapes', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response('data: {malformed\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('data: null\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const events = []
      for await (const event of generateChatStream({ messages: [] })) {
        events.push(event)
      }
      expect(events.at(-1)).toMatchObject({
        code: 'ai_provider_invalid_response',
        phase: 'error',
      })
    }
  })

  it('rejects malformed SSE UTF-8', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        Uint8Array.from([0x64, 0x61, 0x74, 0x61, 0x3a, 0x20, 0xff]),
        {
          headers: { 'Content-Type': 'text/event-stream' },
        },
      ),
    )

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events.at(-1)).toMatchObject({
      code: 'ai_provider_invalid_response',
      phase: 'error',
    })
  })
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

    mockFetch.mockResolvedValueOnce(streamResponseWithReader(mockReader))

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
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 503 }))

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events).toHaveLength(1)
    const [event] = events
    expect(event?.phase).toBe('error')
    if (event?.phase !== 'error') {
      throw new Error('Expected an error event')
    }
    expect(event.message).toBe('AI provider is unavailable')
    expect(event.message).not.toContain('Service unavailable')
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

    mockFetch.mockResolvedValueOnce(streamResponseWithReader(mockReader))

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    // Should have generating + done events (comment skipped)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ chunk: 'hello', phase: 'generating' })
    expect(events[1].phase).toBe('done')
  })

  it('streams reasoning_details as thinking events', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.text","text":"Let me think. "}]} }]}\n\n',
      'data: {"choices":[{"delta":{"reasoning_details":[{"type":"reasoning.text","text":"Then answer."}]} }]}\n\n',
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

    mockFetch.mockResolvedValueOnce(streamResponseWithReader(mockReader))

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        chunk: 'Let me think. ',
        phase: 'thinking',
        thinkingSoFar: 'Let me think. ',
      },
      {
        chunk: 'Then answer.',
        phase: 'thinking',
        thinkingSoFar: 'Let me think. Then answer.',
      },
      {
        phase: 'done',
        rawContent: '',
        stats: {
          completionTokens: 0,
          cost: 0,
          promptTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
        },
        thinking: 'Let me think. Then answer.',
      },
    ])
  })

  it('does not duplicate reasoning when chunks include reasoning and reasoning_details', async () => {
    const sseLines = [
      'data: {"choices":[{"delta":{"reasoning":"I ","reasoning_details":[{"type":"reasoning.text","text":"I "}]} }]}\n\n',
      'data: {"choices":[{"delta":{"reasoning":"need ","reasoning_details":[{"type":"reasoning.text","text":"need "}]} }]}\n\n',
      'data: {"choices":[{"delta":{"reasoning":"valid JSON.","reasoning_details":[{"type":"reasoning.text","text":"valid JSON."}]} }]}\n\n',
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

    mockFetch.mockResolvedValueOnce(streamResponseWithReader(mockReader))

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events.at(-1)).toMatchObject({
      phase: 'done',
      thinking: 'I need valid JSON.',
    })
    expect(
      events.filter(event => event.phase === 'thinking').at(-1),
    ).toMatchObject({
      thinkingSoFar: 'I need valid JSON.',
    })
  })

  it('finishes when OpenRouter sends DONE without closing the response body', async () => {
    let readCount = 0
    const mockReader = {
      read: async () => {
        readCount += 1
        if (readCount === 1) {
          return {
            done: false,
            value: new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"{\\"requirements\\":[]}"}}]}\n\n',
            ),
          }
        }
        if (readCount === 2) {
          return {
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n'),
          }
        }
        return new Promise<ReadableStreamReadResult<Uint8Array>>(() => {})
      },
      releaseLock: vi.fn(),
    }

    mockFetch.mockResolvedValueOnce(streamResponseWithReader(mockReader))

    const events = []
    for await (const event of generateChatStream({ messages: [] })) {
      events.push(event)
    }

    expect(events.map(event => event.phase)).toEqual(['generating', 'done'])
    expect(readCount).toBe(2)
    expect(mockReader.releaseLock).toHaveBeenCalled()
  })

  it('uses an idle timeout instead of an absolute stream timeout', async () => {
    vi.useFakeTimers()
    const sseLines = [
      'data: {"choices":[{"delta":{"reasoning":"first "}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning":"second "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"{\\"requirements\\":[]}"}}]}\n\n',
    ]
    const readResolves: Array<
      (result: ReadableStreamReadResult<Uint8Array>) => void
    > = []
    const mockReader = {
      read: () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>(resolve => {
          readResolves.push(resolve)
        }),
      releaseLock: vi.fn(),
    }
    const waitForRead = async (count: number) => {
      for (
        let attempt = 0;
        attempt < 10 && readResolves.length < count;
        attempt++
      ) {
        await Promise.resolve()
      }
      expect(readResolves).toHaveLength(count)
    }
    const resolveLine = (
      index: number,
      result: ReadableStreamReadResult<Uint8Array>,
    ) => readResolves[index]?.(result)

    mockFetch.mockResolvedValueOnce(streamResponseWithReader(mockReader))

    const eventsPromise = (async () => {
      const events = []
      for await (const event of generateChatStream({ messages: [] })) {
        events.push(event)
      }
      return events
    })()

    await waitForRead(1)
    await vi.advanceTimersByTimeAsync(60_000)
    resolveLine(0, {
      done: false,
      value: new TextEncoder().encode(sseLines[0]),
    })
    await waitForRead(2)
    await vi.advanceTimersByTimeAsync(60_000)
    resolveLine(1, {
      done: false,
      value: new TextEncoder().encode(sseLines[1]),
    })
    await waitForRead(3)
    await vi.advanceTimersByTimeAsync(60_000)
    resolveLine(2, {
      done: false,
      value: new TextEncoder().encode(sseLines[2]),
    })
    await waitForRead(4)
    resolveLine(3, {
      done: false,
      value: new TextEncoder().encode('data: [DONE]\n\n'),
    })

    const events = await eventsPromise
    expect(events.map(event => event.phase)).toEqual([
      'thinking',
      'thinking',
      'generating',
      'done',
    ])
    expect(events).not.toContainEqual(
      expect.objectContaining({ phase: 'error' }),
    )
  })

  it('yields an error when the stream is idle past the timeout', async () => {
    vi.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    const mockReader = {
      read: () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
          requestSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
      releaseLock: vi.fn(),
    }

    mockFetch.mockImplementationOnce(async (_url, init) => {
      requestSignal = (init as { signal?: AbortSignal }).signal
      return streamResponseWithReader(mockReader)
    })

    const eventsPromise = (async () => {
      const events = []
      for await (const event of generateChatStream({ messages: [] })) {
        events.push(event)
      }
      return events
    })()

    await vi.advanceTimersByTimeAsync(120_000)

    const events = await eventsPromise
    expect(events).toEqual([
      {
        code: 'ai_provider_timeout',
        message: 'AI provider request timed out',
        phase: 'error',
      },
    ])
  })

  it('times out while reading a stalled provider error body', async () => {
    vi.useFakeTimers()
    mockFetch.mockImplementationOnce(async (_url, init) => {
      const requestSignal = (init as { signal: AbortSignal }).signal
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            requestSignal.addEventListener(
              'abort',
              () => controller.error(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 503 },
      )
    })

    const eventsPromise = (async () => {
      const events = []
      for await (const event of generateChatStream({ messages: [] })) {
        events.push(event)
      }
      return events
    })()
    await vi.advanceTimersByTimeAsync(120_000)

    await expect(eventsPromise).resolves.toEqual([
      {
        code: 'ai_provider_timeout',
        message: 'AI provider request timed out',
        phase: 'error',
      },
    ])
  })

  it('returns quietly when a caller aborts before the stream request', async () => {
    const controller = new AbortController()
    controller.abort()
    mockFetch.mockImplementationOnce(
      async (_url: string, init: RequestInit) => {
        expect(init.signal?.aborted).toBe(true)
        throw new DOMException('Aborted', 'AbortError')
      },
    )

    const events = []
    for await (const event of generateChatStream({
      messages: [{ content: 'Generate', role: 'user' }],
      signal: controller.signal,
    })) {
      events.push(event)
    }

    expect(events).toEqual([])
  })

  it('returns quietly without diagnostics when a caller aborts while an error body is being read', async () => {
    const caller = new AbortController()
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise(resolve => setTimeout(resolve, 0))
        caller.abort()
        controller.error(
          new Error('provider body leaked Ada Lovelace ada@example.test'),
        )
      },
    })
    mockFetch.mockResolvedValueOnce(
      new Response(stream, {
        headers: { 'Content-Type': 'application/json' },
        status: 503,
      }),
    )

    try {
      const events = []
      for await (const event of generateChatStream({
        messages: [],
        signal: caller.signal,
      })) {
        events.push(event)
      }

      expect(events).toEqual([])
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('returns quietly when a successful stream read and caller abort happen together', async () => {
    const caller = new AbortController()
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mockFetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            caller.abort()
            controller.enqueue(
              new TextEncoder().encode('data: {provider-secret}\n\n'),
            )
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    )

    try {
      const events = []
      for await (const event of generateChatStream({
        messages: [],
        signal: caller.signal,
      })) {
        events.push(event)
      }

      expect(events).toEqual([])
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('reports non-Error fetch failures without leaking their value', async () => {
    mockFetch.mockRejectedValueOnce('provider-secret')

    const events = []
    for await (const event of generateChatStream({
      messages: [{ content: 'Generate', role: 'user' }],
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        code: 'ai_provider_unavailable',
        message: 'AI provider is unavailable',
        phase: 'error',
      },
    ])
  })

  it('reports a successful provider response that has no body', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const events = []
    for await (const event of generateChatStream({
      messages: [{ content: 'Generate', role: 'user' }],
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      {
        code: 'ai_provider_invalid_response',
        message: 'AI provider returned an invalid response',
        phase: 'error',
      },
    ])
  })
})

describe('listModels', () => {
  it('uses the shared stable error contract for model catalog failures', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message:
              'Echo Ada Lovelace ada@example.test password=catalog-secret',
          },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 401,
        },
      ),
    )

    await expect(listModels()).rejects.toMatchObject({
      code: 'ai_provider_configuration_error',
      message: 'AI provider configuration is invalid',
    })
  })

  it('classifies model catalog network, timeout, and parse failures safely', async () => {
    mockFetch
      .mockRejectedValueOnce(
        new Error('Ada ada@example.test password=network-secret'),
      )
      .mockResolvedValueOnce(
        new Response('{"data":', {
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    await expect(listModels()).rejects.toMatchObject({
      code: 'ai_provider_unavailable',
    })
    await expect(listModels()).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })

    const controller = new AbortController()
    controller.abort()
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValueOnce(controller.signal)
    mockFetch.mockRejectedValueOnce(new Error('timeout-secret'))
    try {
      await expect(listModels()).rejects.toMatchObject({
        code: 'ai_provider_timeout',
      })
    } finally {
      timeoutSpy.mockRestore()
    }
  })

  it('returns models from OpenRouter', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
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
    )

    const models = await listModels()
    expect(models).toHaveLength(2)
    expect(models[0].id).toBe('anthropic/claude-sonnet-4')
    expect(models[0].provider).toBe('anthropic')
    expect(models[0].pricing.prompt).toBe('0.000003')
    expect(models[1].id).toBe('google/gemini-2.5-flash')
    expect(models[1].provider).toBe('google')
  })

  it('maps provider model defaults when optional catalog fields are absent', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: 'custom/model', name: 'Minimal model' }],
      }),
    )

    await expect(listModels()).resolves.toEqual([
      {
        contextLength: 0,
        id: 'custom/model',
        modality: undefined,
        name: 'Minimal model',
        pricing: { completion: '0', prompt: '0', reasoning: '0' },
        provider: 'custom',
        supportedParameters: [],
      },
    ])
  })

  it('rejects a catalog response when the provider omits data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}))
    await expect(listModels()).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })
  })

  it('passes supported_parameters filter', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }))

    await listModels(['structured_outputs'])

    const calledUrl = mockFetch.mock.calls[0][0] as string
    /* cspell:disable */
    expect(calledUrl).toContain(
      'supported_parameters=reasoning%2Cstream%2Cresponse_format%2Cstructured_outputs',
    )
    /* cspell:enable */
  })

  it('rejects malformed model entries', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [{ id: 42, name: 'Invalid model' }] }),
    )

    await expect(listModels()).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 500 }))
    await expect(listModels()).rejects.toMatchObject({
      code: 'ai_provider_unavailable',
    })
  })
})

describe('getKeyInfo', () => {
  it('keeps optional credit lookup best-effort under the shared error contract', async () => {
    vi.stubEnv('OPENROUTER_MGMT_API_KEY', 'sk-or-mgmt-test-key')
    mockFetch.mockImplementation(async input => {
      const url = String(input)
      if (url.includes('/credits')) {
        return jsonResponse(
          {
            error: {
              message:
                'Echo Ada Lovelace ada@example.test password=credit-secret',
            },
          },
          { status: 503 },
        )
      }
      if (url.includes('/auth/key')) {
        return jsonResponse({
          data: {
            is_free_tier: false,
            limit: 50,
            limit_remaining: 40,
            usage: 10,
            usage_daily: 1,
          },
        })
      }
      throw new Error(`Unexpected OpenRouter URL: ${url}`)
    })

    await expect(
      getKeyInfo({
        correlationId: 'credits-correlation',
        requestId: 'credits-request',
      }),
    ).resolves.toMatchObject({ totalCredits: null, usage: 10 })
  })

  it('returns credit info with org credits when mgmt key is set', async () => {
    vi.stubEnv('OPENROUTER_MGMT_API_KEY', 'sk-or-mgmt-test-key')
    mockFetch.mockImplementation(async input => {
      const url = String(input)
      if (url.includes('/credits')) {
        return jsonResponse({
          data: { total_credits: 10, total_usage: 0.13 },
        })
      }
      if (url.includes('/auth/key')) {
        return jsonResponse({
          data: {
            is_free_tier: false,
            limit: 50,
            limit_remaining: 37.5,
            usage: 12.5,
            usage_daily: 2.3,
          },
        })
      }
      throw new Error(`Unexpected OpenRouter URL: ${url}`)
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
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            is_free_tier: true,
            limit: null,
            limit_remaining: null,
            usage: 0,
            usage_daily: 0,
          },
        }),
      )

    const info = await getKeyInfo()
    expect(info.isFreeTier).toBe(true)
    expect(info.totalCredits).toBeNull()
    expect(info.managementKeyMissing).toBe(false)
  })

  it('rejects a missing primary key envelope and ignores missing optional credit data', async () => {
    vi.stubEnv('OPENROUTER_MGMT_API_KEY', 'sk-or-mgmt-test-key')
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: { total_usage: 2 } }))
      .mockResolvedValueOnce(jsonResponse({}))

    await expect(getKeyInfo()).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })
  })

  it('rejects a malformed primary key payload and ignores malformed optional credits', async () => {
    vi.stubEnv('OPENROUTER_MGMT_API_KEY', 'sk-or-mgmt-test-key')
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))

    await expect(getKeyInfo()).rejects.toMatchObject({
      code: 'ai_provider_invalid_response',
    })

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: { usage: 1 } }))

    await expect(getKeyInfo()).resolves.toMatchObject({
      totalCredits: null,
      usage: 1,
    })
  })

  it('skips credits fetch and flags managementKeyMissing when mgmt key is not set', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        data: {
          is_free_tier: false,
          limit: 10,
          limit_remaining: 8,
          usage: 2,
          usage_daily: 0.5,
        },
      }),
    )

    const info = await getKeyInfo()
    expect(info.managementKeyMissing).toBe(true)
    expect(info.totalCredits).toBeNull()
    // Only the key endpoint should be called
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain('/key')
  })

  it('throws on non-OK key response', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }))
    await expect(getKeyInfo()).rejects.toMatchObject({
      code: 'ai_provider_configuration_error',
    })
  })
})
