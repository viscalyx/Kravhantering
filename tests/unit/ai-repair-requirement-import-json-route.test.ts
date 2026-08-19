import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/ai/repair-requirement-import-json/route'
import type { AiAuthoringRunEvent } from '@/lib/ai/authoring-runtime'
import { AiRunProfileResolutionError } from '@/lib/ai/profile-resolver'
import type { AiRunEvent, AiRunIdentity } from '@/lib/ai/run-contracts'
import * as aiSafety from '@/lib/ai/safety'
import { DEFAULT_APPLICATION_SETTINGS } from '@/lib/application-settings'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import { attachVerifiedActor } from '@/lib/requirements/auth'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'
import { mockAiSafetyScreening } from '@/tests/helpers/ai-safety-screening'

const routeState = vi.hoisted(() => ({
  buildImportInstruction: vi.fn(),
  events: [] as AiAuthoringRunEvent[],
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
    'https://example.test/api/ai/repair-requirement-import-json',
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
    errors: ['schemaVersion is missing'],
    locale: 'en',
    mode: 'library',
    rawJson: '{"requirements":[]}',
    ...overrides,
  }
}

describe('POST /api/ai/repair-requirement-import-json', () => {
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
        analysis: 'Repair complete',
        identity,
        rawOutput: JSON.stringify({
          requirements: [{ description: 'Repaired requirement.' }],
          schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
        }),
        type: 'completed',
        usage,
      },
    ]
  })

  it.each(['model', 'providerPreferences', 'reasoningEffort'])(
    'rejects caller-selected provider configuration in %s',
    async field => {
      const response = await POST(request(validBody({ [field]: 'legacy' })))

      expect(response.status).toBe(400)
      expect(routeState.run).not.toHaveBeenCalled()
    },
  )

  it('uses the fixed repair profile and returns only a validated terminal result', async () => {
    const response = await POST(request(validBody()))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      payload: {
        requirements: [{ description: 'Repaired requirement.' }],
      },
      stats: { totalTokens: 20 },
      thinking: 'Repair complete',
    })
    const runRequest = routeState.run.mock.calls[0]?.[0]
    expect(runRequest.type).toBe('repair_invalid_import_json')
    expect(runRequest).not.toHaveProperty('model')
    expect(runRequest.task.content[0].text).toContain(
      'schemaVersion is missing',
    )
  })

  it('does not return raw output when the terminal is invalid', async () => {
    routeState.events = [
      {
        analysis: null,
        identity,
        rawOutput: '{broken',
        type: 'completed',
        usage,
      },
    ]

    const response = await POST(request(validBody()))

    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('{broken')
  })

  it('normalizes a cancelled run without a partial body', async () => {
    routeState.events = [
      { identity, reason: 'client_disconnected', type: 'cancelled' },
    ]

    const response = await POST(request(validBody()))

    expect(response.status).toBe(499)
    expect(await response.text()).toBe('')
  })

  it.each([
    [
      'profile_missing',
      'ai_profile_missing',
      'No active administrator-managed profile is configured for this AI action.',
    ],
    [
      'profile_suspended',
      'ai_profile_suspended',
      'The administrator-managed profile for this AI action is suspended.',
    ],
    [
      'profile_blocked',
      'ai_profile_blocked',
      'This AI action is blocked by its administrator-managed profile.',
    ],
  ] as const)(
    'maps a direct POST %s profile race to its action-safe error',
    async (profileCode, code, error) => {
      routeState.run.mockImplementationOnce(() =>
        (async function* () {
          yield* [] as AiRunEvent[]
          throw new AiRunProfileResolutionError(profileCode)
        })(),
      )

      const response = await POST(request(validBody()))

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({ code, error })
    },
  )
})
