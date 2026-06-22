import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { parseCapacityEvents } from '@/tests/helpers/capacity-events'

const routeState = vi.hoisted(() => ({
  generateChatStream: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  loadTaxonomy: vi.fn(),
  query: vi.fn(),
  resolveOpenRouterModelCapabilities: vi.fn(),
  transaction: vi.fn(),
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
  validateGeneratedRequirementsWithMetadata: (requirements: unknown[]) => ({
    originalIndexes: requirements.map((_, index) => index),
    requirements,
  }),
}))

vi.mock('@/lib/ai/openrouter-client', () => ({
  generateChatStream: routeState.generateChatStream,
}))

vi.mock('@/lib/ai/openrouter-model-catalog', () => ({
  resolveOpenRouterModelCapabilities:
    routeState.resolveOpenRouterModelCapabilities,
}))

import { POST } from '@/app/api/ai/generate-requirements/route'

function makeRequest(
  body: Record<string, unknown> | string = {
    locale: 'en',
    topic: 'secure audit logging',
  },
): Request {
  const request = new Request(
    'https://example.test/api/ai/generate-requirements',
    {
      body: typeof body === 'string' ? body : JSON.stringify(body),
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
    hsaId: 'SE5560000001-ai1',
    id: 'ai-user',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc',
  })
  return request
}

describe('POST /api/ai/generate-requirements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInMemoryThrottleForTests()
    routeState.getRequestSqlServerDataSource.mockResolvedValue({
      query: routeState.query,
      transaction: routeState.transaction,
    })
    routeState.query.mockResolvedValue([])
    routeState.transaction.mockImplementation(
      async (
        callback: (manager: { query: typeof routeState.query }) => unknown,
      ) => callback({ query: routeState.query }),
    )
    routeState.loadTaxonomy.mockResolvedValue({
      categories: [{ id: 2, name: 'Security' }],
      qualityCharacteristics: [{ id: 3, name: 'Confidentiality' }],
      requirementPackages: [{ id: 4, name: 'Core' }],
      riskLevels: [{ id: 1, name: 'Low' }],
      types: [{ id: 1, name: 'Functional' }],
    })
    routeState.resolveOpenRouterModelCapabilities.mockResolvedValue({
      contextLength: 200000,
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4',
      pricing: { completion: '0', prompt: '0', reasoning: '0' },
      provider: 'anthropic',
      supportedParameters: [
        'reasoning',
        'stream',
        'response_format',
        'structured_outputs',
      ],
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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
      const streamOptions = routeState.generateChatStream.mock.calls[0]?.[0]
      expect(streamOptions).not.toHaveProperty('logprobs')
      expect(streamOptions).not.toHaveProperty('topLogprobs')
      expect(streamOptions).toMatchObject({
        model: 'anthropic/claude-sonnet-4',
        supportedParameters: [
          'reasoning',
          'stream',
          'response_format',
          'structured_outputs',
        ],
      })
      expect(
        routeState.resolveOpenRouterModelCapabilities,
      ).toHaveBeenCalledWith(undefined)
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

  it('rejects stale client-supplied model capabilities', async () => {
    const response = await POST(
      makeRequest({
        locale: 'en',
        supportedParameters: ['structured_outputs'],
        topic: 'secure audit logging',
      }),
    )

    expect(response.status).toBe(400)
    expect(routeState.resolveOpenRouterModelCapabilities).not.toHaveBeenCalled()
    expect(routeState.generateChatStream).not.toHaveBeenCalled()
  })

  it('denies generation before loading taxonomy or calling the provider', async () => {
    const request = makeRequest()
    attachVerifiedActor(request, {
      displayName: 'AI User',
      hsaId: 'SE5560000001-ai1',
      id: 'ai-user',
      isAuthenticated: true,
      roles: [],
      source: 'oidc',
    })

    const response = await POST(request)
    const body = (await response.json()) as { error: string }

    expect(response.status).toBe(403)
    expect(body.error).toBe('Forbidden')
    expect(routeState.loadTaxonomy).not.toHaveBeenCalled()
    expect(routeState.generateChatStream).not.toHaveBeenCalled()
  })

  it('returns a sanitized unavailable event when security scans disable AI generation', async () => {
    vi.stubEnv('AI_REQUIREMENT_GENERATION_DISABLED', '1')
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(response.headers.get('Content-Type')).toContain(
        'text/event-stream',
      )
      expect(text).toContain('event: error')
      expect(text).toContain('"message":"AI provider is unavailable"')
      expect(
        routeState.resolveOpenRouterModelCapabilities,
      ).not.toHaveBeenCalled()
      expect(routeState.loadTaxonomy).not.toHaveBeenCalled()
      expect(routeState.generateChatStream).not.toHaveBeenCalled()
      expect(parseCapacityEvents(consoleErrorSpy)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'capacity.operation.failed',
            operation: 'ai.generate-requirements',
            outcome: 'failure',
            status_code: 503,
          }),
        ]),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('returns a sanitized unavailable event when Admin Center disables AI generation', async () => {
    routeState.query.mockResolvedValueOnce([
      { requirementGenerationEnabled: 0 },
    ])
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(response.headers.get('Content-Type')).toContain(
        'text/event-stream',
      )
      expect(text).toContain('event: error')
      expect(text).toContain('"message":"AI provider is unavailable"')
      expect(routeState.loadTaxonomy).not.toHaveBeenCalled()
      expect(
        routeState.resolveOpenRouterModelCapabilities,
      ).not.toHaveBeenCalled()
      expect(routeState.generateChatStream).not.toHaveBeenCalled()
      expect(parseCapacityEvents(consoleErrorSpy)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'capacity.operation.failed',
            operation: 'ai.generate-requirements',
            outcome: 'failure',
            status_code: 503,
          }),
        ]),
      )
    } finally {
      consoleErrorSpy.mockRestore()
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

  it('sends a sanitized error when model capabilities cannot be resolved', async () => {
    routeState.resolveOpenRouterModelCapabilities.mockRejectedValueOnce(
      new Error('OpenRouter lookup failed with sk-or-v1-secret'),
    )

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(text).toContain('"message":"AI provider is unavailable"')
      expect(text).not.toContain('sk-or-v1-secret')
      expect(routeState.generateChatStream).not.toHaveBeenCalled()
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

  it('applies the generation throttle before validating the request body', async () => {
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

      const response = await POST(makeRequest('not-json'))
      const body = (await response.json()) as { error: string }

      expect(response.status).toBe(429)
      expect(body.error).toContain('Too many AI generation requests')
      expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(5)
      expect(
        parseCapacityEvents(consoleInfoSpy).some(
          event =>
            event.event === 'capacity.throttled' &&
            event.operation === 'ai.generate-requirements' &&
            event.outcome === 'throttled' &&
            event.throttled === true,
        ),
      ).toBe(true)
    } finally {
      consoleInfoSpy.mockRestore()
    }
  })
})
