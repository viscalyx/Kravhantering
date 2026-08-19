import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_GENERATE_REQUIREMENT_IMPORT_MAX_REQUEST_BYTES,
  POST,
} from '@/app/api/ai/generate-requirement-import/route'
import type { AiRunEvent, AiRunIdentity } from '@/lib/ai/run-contracts'
import * as aiSafety from '@/lib/ai/safety'
import { DEFAULT_APPLICATION_SETTINGS } from '@/lib/application-settings'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'
import { mockAiSafetyScreening } from '@/tests/helpers/ai-safety-screening'

const routeState = vi.hoisted(() => ({
  buildImportInstruction: vi.fn(),
  events: [] as AiRunEvent[],
  getAiGenerationAvailability: vi.fn(),
  getApplicationSettings: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  run: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/dal/ai-settings', () => ({
  getAiGenerationAvailability: routeState.getAiGenerationAvailability,
}))
vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: routeState.getApplicationSettings,
}))
vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRuntime: vi.fn(() => ({
    service: { buildImportInstruction: routeState.buildImportInstruction },
  })),
}))
vi.mock('@/lib/ai/authoring-runtime', () => ({
  createProductionAiAuthoringRuntime: vi.fn(() => ({ run: routeState.run })),
}))

const identity = {
  aiConnectionId: 'connection',
  aiConnectionModelRevisionId: 'model-revision',
  aiRunProfileRevisionId: 'profile-revision',
} as AiRunIdentity
const usage = {
  analysisTokens: { reason: 'not_reported', status: 'unavailable' },
  cost: { reason: 'not_reported', status: 'unavailable' },
  inputTokens: { reason: 'not_reported', status: 'unavailable' },
  outputTokens: { status: 'reported', value: 12 },
  totalTokens: { status: 'reported', value: 20 },
} as const

function request(body: Record<string, unknown>): Request {
  const value = new Request(
    'https://example.test/api/ai/generate-requirement-import',
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  )
  attachVerifiedActor(value, {
    displayName: 'Author',
    hsaId: null,
    id: 'author-1',
    isAuthenticated: true,
    roles: ['Admin'],
    source: 'oidc',
  })
  return value
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    areaId: 1,
    count: 2,
    locale: 'en',
    mode: 'library',
    need: 'Safe auditable access',
    ...overrides,
  }
}

async function events(response: Response) {
  const text = await response.text()
  return text
    .split('\n\n')
    .filter(Boolean)
    .map(block => {
      const [eventLine, dataLine] = block.split('\n')
      return {
        data: JSON.parse(dataLine?.slice(6) ?? 'null') as unknown,
        event: eventLine?.slice(7),
      }
    })
}

describe('POST /api/ai/generate-requirement-import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearInMemoryThrottleForTests()
    mockAiSafetyScreening(aiSafety)
    routeState.getRequestSqlServerDataSource.mockResolvedValue({
      query: vi.fn(),
    })
    routeState.getAiGenerationAvailability.mockResolvedValue({
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: true,
    })
    routeState.getApplicationSettings.mockResolvedValue(
      DEFAULT_APPLICATION_SETTINGS,
    )
    routeState.buildImportInstruction.mockResolvedValue('# Import contract')
    routeState.run.mockImplementation(() =>
      (async function* () {
        yield* routeState.events
      })(),
    )
    routeState.events = [
      {
        analysis: 'Checked after completion',
        identity,
        rawOutput: JSON.stringify({
          requirements: [{ description: 'Use role-based access.' }],
          schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        }),
        type: 'completed',
        usage,
      },
    ]
  })

  it.each(['model', 'providerPreferences', 'reasoningEffort'])(
    'rejects the removed provider-shaped %s field',
    async field => {
      const response = await POST(request(validBody({ [field]: 'legacy' })))

      expect(response.status).toBe(400)
      expect(routeState.run).not.toHaveBeenCalled()
    },
  )

  it('selects the image run type without sending a model or provider field', async () => {
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const response = await POST(request(validBody({ images: [{ dataUrl }] })))

    expect(response.status).toBe(200)
    expect(routeState.run).toHaveBeenCalledOnce()
    const runRequest = routeState.run.mock.calls[0]?.[0]
    expect(runRequest.type).toBe('generate_with_images')
    expect(runRequest).not.toHaveProperty('model')
    expect(runRequest.task.content).toEqual([
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({ mediaType: 'image/png', type: 'image' }),
    ])
  })

  it('does not project adapter deltas and releases only the terminal result', async () => {
    routeState.events = [
      { delta: 'secret partial', type: 'analysis_delta' },
      {
        delta: '{"partial":true}',
        type: 'output_delta',
        visibility: 'internal',
      },
      ...routeState.events,
    ]

    const response = await POST(request(validBody()))
    const projected = await events(response)

    expect(projected).toHaveLength(1)
    expect(projected[0]).toMatchObject({
      data: {
        payload: {
          requirements: [{ description: 'Use role-based access.' }],
        },
        stats: { totalTokens: 20 },
        thinking: 'Checked after completion',
      },
      event: 'done',
    })
    expect(JSON.stringify(projected)).not.toContain('secret partial')
    expect(JSON.stringify(projected)).not.toContain('model-revision')
  })

  it('projects one safe error for a neutral terminal failure', async () => {
    routeState.events = [
      {
        failure: { category: 'rate_limited', retryable: false },
        identity,
        type: 'failed',
      },
    ]

    const response = await POST(request(validBody()))

    await expect(events(response)).resolves.toEqual([
      {
        data: expect.objectContaining({ code: 'ai_provider_rate_limited' }),
        event: 'error',
      },
    ])
  })

  it('rejects an oversized request before constructing a run', async () => {
    const response = await POST(
      request(
        validBody({
          need: 'x'.repeat(AI_GENERATE_REQUIREMENT_IMPORT_MAX_REQUEST_BYTES),
        }),
      ),
    )

    expect(response.status).toBe(413)
    expect(routeState.run).not.toHaveBeenCalled()
  })
})
