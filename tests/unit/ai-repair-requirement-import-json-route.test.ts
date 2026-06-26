import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ai/repair-requirement-import-json/route'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'
import { parseCapacityEvents } from '@/tests/helpers/capacity-events'

const routeState = vi.hoisted(() => ({
  generateChat: vi.fn(),
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
        buildImportAiPrompt: vi.fn(async () => '# Import contract'),
      },
    })),
  }
})

vi.mock('@/lib/ai/openrouter-client', () => ({
  generateChat: routeState.generateChat,
}))

vi.mock('@/lib/ai/openrouter-model-catalog', () => ({
  resolveOpenRouterModelCapabilities:
    routeState.resolveOpenRouterModelCapabilities,
}))

function makeRequest(
  body: Record<string, unknown> | string = {
    areaId: 1,
    errors: ['schemaVersion is missing'],
    locale: 'en',
    mode: 'library',
    rawJson: '{"requirements":[]}',
  },
): Request {
  const request = new Request(
    'https://example.test/api/ai/repair-requirement-import-json',
    {
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': 'workflow-ai-repair',
        'x-request-id': 'request-ai-repair',
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

describe('POST /api/ai/repair-requirement-import-json', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInMemoryThrottleForTests()
    routeState.getRequestSqlServerDataSource.mockResolvedValue({
      query: routeState.query,
    })
    routeState.query.mockResolvedValue([])
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

  it('returns repaired requirement import JSON after schema validation', async () => {
    const consoleInfoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)
    routeState.generateChat.mockResolvedValue({
      content: {
        requirements: [
          { description: 'The system shall keep repaired audit logs.' },
        ],
        schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
      },
      stats: {
        completionTokens: 7,
        cost: 0.02,
        promptTokens: 3,
        reasoningTokens: 0,
        totalTokens: 10,
      },
      thinking: 'fixed import JSON',
    })

    try {
      const response = await POST(makeRequest())
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        model: 'anthropic/claude-sonnet-4',
        payload: {
          requirements: [
            { description: 'The system shall keep repaired audit logs.' },
          ],
          schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        },
        stats: { totalTokens: 10 },
        thinking: 'fixed import JSON',
      })
      expect(routeState.generateChat).toHaveBeenCalledWith(
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
        correlation_id: 'workflow-ai-repair',
        event: 'capacity.operation.completed',
        operation: 'ai.repair-requirement-import-json',
        request_id: 'request-ai-repair',
        token_count: 10,
      })
    } finally {
      consoleInfoSpy.mockRestore()
    }
  })

  it('returns 422 with schema issues when repaired JSON is invalid', async () => {
    routeState.generateChat.mockResolvedValue({
      content: { requirements: [] },
      stats: {
        completionTokens: 7,
        cost: 0.02,
        promptTokens: 3,
        reasoningTokens: 0,
        totalTokens: 10,
      },
      thinking: '',
    })

    const response = await POST(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      error: 'Repaired JSON did not match the requirement import schema.',
    })
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.any(String) }),
      ]),
    )
  })
})
