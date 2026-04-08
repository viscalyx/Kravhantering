import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateChat,
  generateChatStream,
  listModels,
} from '@/lib/ai/ollama-client'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OLLAMA_HOST', 'http://test-ollama:11434')
  vi.stubEnv('OLLAMA_MODEL', 'test-model:7b')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generateChat (non-streaming)', () => {
  it('sends correct request to Ollama', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        done: true,
        eval_count: 100,
        eval_duration: 5000000000,
        message: {
          content: '{"requirements":[]}',
          thinking: 'I analyzed the topic...',
        },
        total_duration: 6000000000,
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
      'http://test-ollama:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.model).toBe('test-model:7b')
    expect(body.stream).toBe(false)
    expect(body.think).toBe(true)
    expect(body.messages).toHaveLength(2)

    expect(result.thinking).toBe('I analyzed the topic...')
    expect(result.content).toEqual({ requirements: [] })
    expect(result.stats.evalCount).toBe(100)
  })

  it('uses custom model when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        done: true,
        message: { content: '{"requirements":[]}' },
      }),
      ok: true,
    })

    await generateChat({ messages: [], model: 'custom:8b' })

    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.model).toBe('custom:8b')
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    })

    await expect(generateChat({ messages: [] })).rejects.toThrow(
      'Ollama request failed (500)',
    )
  })

  it('throws on invalid JSON content', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        done: true,
        message: { content: 'not json' },
      }),
      ok: true,
    })

    await expect(generateChat({ messages: [] })).rejects.toThrow(
      'Failed to parse Ollama JSON response',
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
    const chunks = [
      '{"message":{"thinking":"Let me "},"done":false}\n',
      '{"message":{"thinking":"think..."},"done":false}\n',
      // cspell:disable-next-line
      '{"message":{"content":"{\\"req"},"done":false}\n',
      // cspell:disable-next-line
      '{"message":{"content":"uirements\\":[]}"},"done":false}\n',
      '{"eval_count":50,"eval_duration":2000000000,"total_duration":3000000000,"done":true}\n',
    ]

    let chunkIndex = 0
    const mockReader = {
      read: async () => {
        if (chunkIndex >= chunks.length) {
          return { done: true, value: undefined }
        }
        const value = new TextEncoder().encode(chunks[chunkIndex++])
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
          evalCount: 50,
          evalDuration: 2000000000,
          totalDuration: 3000000000,
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
})

describe('listModels', () => {
  it('returns models from Ollama', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        models: [
          {
            details: { parameter_size: '14B', quantization_level: 'Q4_K_M' },
            name: 'qwen3:14b',
            size: 9300000000,
          },
          {
            details: { parameter_size: '8B' },
            name: 'qwen3:8b',
            size: 5200000000,
          },
        ],
      }),
      ok: true,
    })

    const models = await listModels()
    expect(models).toHaveLength(2)
    expect(models[0].name).toBe('qwen3:14b')
    expect(models[0].parameter_size).toBe('14B')
    expect(models[1].name).toBe('qwen3:8b')
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(listModels()).rejects.toThrow('Failed to list Ollama models')
  })
})
