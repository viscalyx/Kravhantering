import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { attachVerifiedActor } from '@/lib/requirements/auth'

const routeState = vi.hoisted(() => ({
  generateChatStream: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  loadTaxonomy: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/ai/taxonomy', () => ({
  loadTaxonomy: routeState.loadTaxonomy,
}))

vi.mock('@/lib/ai/requirement-prompt', () => ({
  REQUIREMENT_FORMAT_SCHEMA: { type: 'object' },
  buildSystemPrompt: () => 'system prompt',
  buildUserPrompt: () => 'user prompt',
  validateGeneratedRequirements: (requirements: unknown[]) => requirements,
}))

vi.mock('@/lib/ai/openrouter-client', () => ({
  generateChatStream: routeState.generateChatStream,
}))

import { POST } from '@/app/api/ai/generate-requirements/route'

function makeRequest(): Request {
  const request = new Request(
    'https://example.test/api/ai/generate-requirements',
    {
      body: JSON.stringify({
        locale: 'en',
        topic: 'secure audit logging',
      }),
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': 'workflow-ai',
        'x-request-id': 'request-ai',
      },
      method: 'POST',
    },
  )
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

function parseCapacityEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls
    .map((call: unknown[]) => {
      try {
        return JSON.parse(String(call[0])) as Record<string, unknown>
      } catch {
        return null
      }
    })
    .filter(
      (
        event: Record<string, unknown> | null,
      ): event is Record<string, unknown> =>
        event !== null && event.channel === 'capacity-observability',
    )
}

describe('POST /api/ai/generate-requirements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInMemoryThrottleForTests()
    routeState.getRequestSqlServerDataSource.mockResolvedValue({})
    routeState.loadTaxonomy.mockResolvedValue({})
  })

  it('logs successful generation capacity metrics', async () => {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)
    routeState.generateChatStream.mockImplementation(async function* () {
      yield {
        phase: 'done',
        rawContent: '{"requirements":[]}',
        stats: {
          completionTokens: 7,
          cost: 0.02,
          promptTokens: 3,
          reasoningTokens: 0,
          totalTokens: 10,
        },
        thinking: '',
      }
    })

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(text).toContain('event: done')
      expect(response.headers.get('X-Request-Id')).toBe('request-ai')
      expect(response.headers.get('X-Correlation-Id')).toBe('workflow-ai')
      expect(parseCapacityEvents(consoleInfoSpy)[0]).toMatchObject({
        correlation_id: 'workflow-ai',
        cost: 0.02,
        event: 'capacity.operation.completed',
        operation: 'ai.generate-requirements',
        request_id: 'request-ai',
        token_count: 10,
      })
    } finally {
      consoleInfoSpy.mockRestore()
    }
  })

  it('streams sanitized provider errors only', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    routeState.generateChatStream.mockImplementation(async function* () {
      yield {
        cause:
          'OpenRouter error (500): SELECT token FROM sessions; Authorization: Bearer eyJhbGci.demo.payload; sk-or-v1-secret',
        message: 'AI provider is unavailable',
        phase: 'error',
      }
    })

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(response.headers.get('Content-Type')).toContain(
        'text/event-stream',
      )
      expect(text).toContain('event: error')
      expect(text).toContain('"message":"AI provider is unavailable"')
      expect(text).not.toMatch(/OpenRouter error|SELECT|Bearer|sk-or-v1/)
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toMatch(
        /SELECT token|eyJhbGci|sk-or-v1-secret/,
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('sanitizes thrown stream failures', async () => {
    routeState.generateChatStream.mockImplementation(async function* () {
      yield* []
      throw new Error('network failed with sk-or-v1-secret')
    })

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(text).toContain('"message":"AI provider is unavailable"')
      expect(text).not.toContain('sk-or-v1-secret')
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
        'sk-or-v1-secret',
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('returns 429 and logs throttling when the process-local limit is reached', async () => {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)
    routeState.generateChatStream.mockImplementation(async function* () {
      yield {
        phase: 'done',
        rawContent: '{"requirements":[]}',
        stats: {
          completionTokens: 0,
          cost: 0,
          promptTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
        },
        thinking: '',
      }
    })

    try {
      for (let index = 0; index < 5; index += 1) {
        await (await POST(makeRequest())).text()
      }

      const response = await POST(makeRequest())
      const body = (await response.json()) as { error: string }

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('60')
      expect(body.error).toContain('Too many AI generation requests')
      expect(parseCapacityEvents(consoleInfoSpy)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'capacity.throttled',
            operation: 'ai.generate-requirements',
            outcome: 'throttled',
            throttled: true,
          }),
        ]),
      )
    } finally {
      consoleInfoSpy.mockRestore()
    }
  })
})
