import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ai/generate-requirement-import/route'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'
import { parseCapacityEvents } from '@/tests/helpers/capacity-events'

const routeState = vi.hoisted(() => ({
  buildImportAiPrompt: vi.fn(),
  generateChatStream: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  query: vi.fn(),
  resolveOpenRouterModelCapabilities: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/requirements/server', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/lib/requirements/server')>()
  return {
    ...original,
    createRequirementsRuntime: vi.fn(() => ({
      service: {
        buildImportAiPrompt: routeState.buildImportAiPrompt,
      },
    })),
  }
})

vi.mock('@/lib/ai/openrouter-client', () => ({
  generateChatStream: routeState.generateChatStream,
}))

vi.mock('@/lib/ai/openrouter-model-catalog', () => ({
  resolveOpenRouterModelCapabilities:
    routeState.resolveOpenRouterModelCapabilities,
}))

function makeRequest(
  body: Record<string, unknown> | string = {
    areaId: 1,
    locale: 'en',
    mode: 'library',
    need: 'secure audit logging',
  },
): Request {
  const request = new Request(
    'https://example.test/api/ai/generate-requirement-import',
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

describe('POST /api/ai/generate-requirement-import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInMemoryThrottleForTests()
    routeState.getRequestSqlServerDataSource.mockResolvedValue({
      query: routeState.query,
    })
    routeState.query.mockResolvedValue([])
    routeState.buildImportAiPrompt.mockResolvedValue('# Import contract')
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

  it('streams generated requirement import JSON after schema validation', async () => {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)
    routeState.generateChatStream.mockImplementation(async function* () {
      yield {
        phase: 'done',
        rawContent: JSON.stringify({
          requirements: [{ description: 'The system shall keep audit logs.' }],
          schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        }),
        stats: {
          completionTokens: 7,
          cost: 0.02,
          promptTokens: 3,
          reasoningTokens: 0,
          totalTokens: 10,
        },
        thinking: 'checked import contract',
      }
    })

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(text).toContain('event: done')
      expect(text).toContain(REQUIREMENTS_IMPORT_SCHEMA_VERSION)
      expect(text).toContain('The system shall keep audit logs.')
      expect(routeState.generateChatStream).toHaveBeenCalledWith(
        expect.objectContaining({
          format: expect.objectContaining({
            properties: expect.objectContaining({
              requirements: expect.any(Object),
              schemaVersion: expect.any(Object),
            }),
          }),
          model: 'anthropic/claude-sonnet-4',
        }),
      )
      expect(parseCapacityEvents(consoleInfoSpy)[0]).toMatchObject({
        correlation_id: 'workflow-ai',
        event: 'capacity.operation.completed',
        operation: 'ai.generate-requirement-import',
        request_id: 'request-ai',
        token_count: 10,
      })
    } finally {
      consoleInfoSpy.mockRestore()
    }
  })

  it('streams validation_error when model output does not match import schema', async () => {
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

    const response = await POST(makeRequest())
    const text = await response.text()

    expect(text).toContain('event: validation_error')
    expect(text).not.toContain('event: done')
    expect(text).toContain('Generated JSON did not match')
  })

  it('streams provider unavailable when prompt loading fails before generation starts', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.buildImportAiPrompt.mockRejectedValueOnce(
      new Error('prompt service unavailable'),
    )

    try {
      const response = await POST(makeRequest())
      const text = await response.text()

      expect(response.status).toBe(503)
      expect(response.headers.get('Content-Type')).toContain(
        'text/event-stream',
      )
      expect(text).toContain('event: error')
      expect(text).toContain('AI provider is unavailable')
      expect(routeState.generateChatStream).not.toHaveBeenCalled()
      expect(parseCapacityEvents(consoleErrorSpy)[0]).toMatchObject({
        event: 'capacity.operation.failed',
        operation: 'ai.generate-requirement-import',
        status_code: 503,
      })
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('localizes image and scope validation errors from the request locale', async () => {
    const imageResponse = await POST(
      makeRequest({
        areaId: 1,
        images: [{ dataUrl: 'data:text/plain;base64,SGVq' }],
        locale: 'sv',
        mode: 'library',
        need: 'säker loggning',
      }),
    )
    const imageBody = (await imageResponse.json()) as {
      issues: Array<{ message: string; path: string }>
    }

    expect(imageResponse.status).toBe(400)
    expect(imageBody.issues).toEqual([
      expect.objectContaining({
        message: 'Bildtypen stöds inte. Använd PNG, JPEG, GIF eller WebP.',
        path: 'images.0.dataUrl',
      }),
    ])

    const scopeResponse = await POST(
      makeRequest({
        locale: 'sv',
        mode: 'specification-local',
        need: 'säker loggning',
      }),
    )
    const scopeBody = (await scopeResponse.json()) as {
      issues: Array<{ message: string; path: string }>
    }

    expect(scopeResponse.status).toBe(400)
    expect(scopeBody.issues).toEqual([
      expect.objectContaining({
        message:
          'Biblioteksläge kräver areaId och kravunderlagslokalt läge kräver specificationIdOrSlug.',
        path: 'mode',
      }),
    ])
  })

  it('rejects malformed image base64 before provider use', async () => {
    const response = await POST(
      makeRequest({
        areaId: 1,
        images: [{ dataUrl: 'data:image/png;base64,not-base64' }],
        locale: 'en',
        mode: 'library',
        need: 'secure audit logging',
      }),
    )
    const body = (await response.json()) as {
      issues: Array<{ message: string; path: string }>
    }

    expect(response.status).toBe(400)
    expect(body.issues).toEqual([
      expect.objectContaining({
        message: 'Image data is not valid base64.',
        path: 'images.0.dataUrl',
      }),
    ])
    expect(routeState.buildImportAiPrompt).not.toHaveBeenCalled()
    expect(routeState.generateChatStream).not.toHaveBeenCalled()
  })
})
