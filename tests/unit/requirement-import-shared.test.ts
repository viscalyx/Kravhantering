import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  aiRunFailureError,
  checkAiRequirementImportThrottle,
  countImageBytes,
  createUnavailableAiStreamResponse,
  formatAiSafetyBlockedMessage,
  guardAiInput,
  imageDataUrlSchema,
  isValidRequirementImportScope,
  MAX_AI_IMAGE_DATA_URL_LENGTH,
  requirementImportDestination,
  requirementImportScopeAction,
  toAiTaskContent,
  validateRequirementImportImages,
  validateRequirementImportScope,
} from '@/app/api/ai/requirement-import-shared'
import type { AiRunFailure } from '@/lib/ai/run-contracts'
import type { AiSafetyDecision, AiSafetyScreeningResult } from '@/lib/ai/safety'
import type { SqlServerDatabase } from '@/lib/db'
import { clearInMemoryThrottleForTests } from '@/lib/observability/throttle'
import type { RequestContext } from '@/lib/requirements/auth'

const safetyState = vi.hoisted(() => ({
  recordAiSafetyBlock: vi.fn(),
  screenAiInputDetailed: vi.fn(),
}))

vi.mock('@/lib/ai/safety', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/ai/safety')>()
  return {
    ...original,
    recordAiSafetyBlock: safetyState.recordAiSafetyBlock,
    screenAiInputDetailed: safetyState.screenAiInputDetailed,
  }
})

const db = {} as SqlServerDatabase
const request = new Request(
  'https://example.test/api/ai/generate-requirement-import',
  { method: 'POST' },
)

function makeContext(): RequestContext {
  return {
    actor: {
      displayName: 'AI User',
      hsaId: 'SE5560000001-ai1',
      id: 'ai-user',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'workflow-ai',
    requestId: 'request-ai',
    source: 'rest',
  }
}

function makeDecision(overrides: Partial<AiSafetyDecision>): AiSafetyDecision {
  return {
    allowed: true,
    categories: [],
    primaryRuleId: null,
    primaryRuleType: null,
    ruleIds: [],
    ruleTypes: [],
    textLength: 12,
    ...overrides,
  }
}

function makeScreening(decision: AiSafetyDecision): AiSafetyScreeningResult {
  return {
    contentParts: [{ label: 'need', text: 'secure audit logging' }],
    decision,
    forensicEvidence: [],
  }
}

describe('guardAiInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when input is allowed', async () => {
    const parts = [{ label: 'need', text: 'secure audit logging' }]
    const onBlockedInput = vi.fn()
    const onSafetyFilterFailure = vi.fn(
      () => new Response('unavailable', { status: 503 }),
    )
    safetyState.screenAiInputDetailed.mockResolvedValue(
      makeScreening(makeDecision({ allowed: true })),
    )

    const response = await guardAiInput({
      blockedStep: 'ai_request_input',
      context: makeContext(),
      db,
      locale: 'en',
      onBlockedInput,
      onSafetyFilterFailure,
      operation: 'ai.generate-requirement-import',
      parts,
      request,
    })

    expect(response).toBeNull()
    expect(safetyState.screenAiInputDetailed).toHaveBeenCalledWith(db, parts)
    expect(safetyState.recordAiSafetyBlock).not.toHaveBeenCalled()
    expect(onBlockedInput).not.toHaveBeenCalled()
    expect(onSafetyFilterFailure).not.toHaveBeenCalled()
  })

  it('records and returns a correlated localized 400 response when input is blocked', async () => {
    const context = makeContext()
    const onBlockedInput = vi.fn()
    const onSafetyFilterFailure = vi.fn(
      () => new Response('unavailable', { status: 503 }),
    )
    const screening = makeScreening(
      makeDecision({
        allowed: false,
        categories: ['prompt_injection'],
        primaryRuleId: 'instruction_override',
        primaryRuleType: 'Prompt injection: instruction override',
        ruleIds: ['instruction_override'],
        ruleTypes: ['Prompt injection: instruction override'],
      }),
    )
    safetyState.screenAiInputDetailed.mockResolvedValue(screening)
    safetyState.recordAiSafetyBlock.mockResolvedValue(undefined)

    const response = await guardAiInput({
      blockedStep: 'repair_input',
      context,
      db,
      locale: 'sv',
      onBlockedInput,
      onSafetyFilterFailure,
      operation: 'ai.repair-requirement-import-json',
      parts: screening.contentParts,
      request,
    })

    expect(response?.status).toBe(400)
    expect(response?.headers.get('X-Request-Id')).toBe('request-ai')
    expect(response?.headers.get('X-Correlation-Id')).toBe('workflow-ai')
    await expect(response?.json()).resolves.toEqual({
      error:
        'AI-anropet blockerades av AI-säkerhetsfiltret: Promptinjektion: instruktionsövertagande. Ändra behovet eller sammanhanget och försök igen.',
    })
    expect(safetyState.recordAiSafetyBlock).toHaveBeenCalledWith({
      blockedStep: 'repair_input',
      context,
      db,
      direction: 'input',
      event: 'ai.input_safety.blocked',
      operation: 'ai.repair-requirement-import-json',
      request,
      screening,
    })
    expect(onBlockedInput).toHaveBeenCalledOnce()
    expect(onSafetyFilterFailure).not.toHaveBeenCalled()
  })

  it('still returns the blocked response when recording the safety block fails', async () => {
    const context = makeContext()
    const onBlockedInput = vi.fn()
    const onSafetyFilterFailure = vi.fn(
      () => new Response('unavailable', { status: 503 }),
    )
    const screening = makeScreening(
      makeDecision({
        allowed: false,
        categories: ['prompt_injection'],
        primaryRuleId: 'instruction_override',
        primaryRuleType: 'Prompt injection: instruction override',
        ruleIds: ['instruction_override'],
        ruleTypes: ['Prompt injection: instruction override'],
      }),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    safetyState.screenAiInputDetailed.mockResolvedValue(screening)
    safetyState.recordAiSafetyBlock.mockRejectedValue(
      new Error('audit unavailable'),
    )

    try {
      const response = await guardAiInput({
        blockedStep: 'ai_request_input',
        context,
        db,
        locale: 'en',
        onBlockedInput,
        onSafetyFilterFailure,
        operation: 'ai.generate-requirement-import',
        parts: screening.contentParts,
        request,
      })

      expect(response?.status).toBe(400)
      expect(response?.headers.get('X-Request-Id')).toBe('request-ai')
      expect(response?.headers.get('X-Correlation-Id')).toBe('workflow-ai')
      await expect(response?.json()).resolves.toEqual({
        error:
          'The AI request was blocked by the AI safety filter: Prompt injection: instruction override. Revise the need or context and try again.',
      })
      expect(safetyState.recordAiSafetyBlock).toHaveBeenCalledWith({
        blockedStep: 'ai_request_input',
        context,
        db,
        direction: 'input',
        event: 'ai.input_safety.blocked',
        operation: 'ai.generate-requirement-import',
        request,
        screening,
      })
      expect(onBlockedInput).toHaveBeenCalledOnce()
      expect(onSafetyFilterFailure).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('returns the caller failure response when safety screening fails', async () => {
    const error = new Error('safety screen unavailable')
    const failureResponse = new Response('unavailable', { status: 503 })
    const onBlockedInput = vi.fn()
    const onSafetyFilterFailure = vi.fn(() => failureResponse)
    safetyState.screenAiInputDetailed.mockRejectedValue(error)

    const response = await guardAiInput({
      blockedStep: 'ai_request_input',
      context: makeContext(),
      db,
      locale: 'en',
      onBlockedInput,
      onSafetyFilterFailure,
      operation: 'ai.generate-requirement-import',
      parts: [{ label: 'need', text: 'secure audit logging' }],
      request,
    })

    expect(response).toBe(failureResponse)
    expect(onSafetyFilterFailure).toHaveBeenCalledWith(error)
    expect(safetyState.recordAiSafetyBlock).not.toHaveBeenCalled()
    expect(onBlockedInput).not.toHaveBeenCalled()
  })
})

describe('aiRunFailureError', () => {
  it.each([
    [
      'authentication_failed',
      'upstream_authentication_failed',
      'ai_provider_unavailable',
      'The AI connection could not authenticate with the provider.',
    ],
    [
      'rate_limited',
      'upstream_rate_limited',
      'ai_provider_rate_limited',
      'The AI provider is receiving too many requests.',
    ],
    [
      'invalid_response',
      'invalid_upstream_stream_event',
      'ai_provider_invalid_response',
      'The AI provider returned a response format that the application could not process.',
    ],
    [
      'deadline_exceeded',
      'upstream_deadline_exceeded',
      'ai_provider_unavailable',
      'The AI provider did not finish within the allowed time.',
    ],
  ] as const)(
    'maps %s to an actionable public error',
    (category, diagnosticCode, code, message) => {
      const failure: AiRunFailure = {
        category,
        diagnosticCode,
        retryable: false,
      }

      expect(aiRunFailureError(failure, 'en')).toEqual({
        code,
        message,
        technicalCode: diagnosticCode,
      })
    },
  )

  it('localizes the safe explanation and omits an unsafe diagnostic value', () => {
    expect(
      aiRunFailureError(
        {
          category: 'connection_unavailable',
          diagnosticCode: 'provider failed: secret response body',
          retryable: true,
        },
        'sv',
      ),
    ).toEqual({
      code: 'ai_provider_unavailable',
      message:
        'Det gick inte att nå AI-leverantören. Försök igen. Kontakta en administratör om problemet kvarstår.',
    })
  })
})

describe('requirementImportDestination', () => {
  it('maps valid AI import scopes to import destinations', () => {
    expect(
      requirementImportDestination({
        areaId: 7,
        mode: 'library',
      }),
    ).toEqual({
      areaId: 7,
      kind: 'requirements_library',
    })
    expect(
      requirementImportDestination({
        mode: 'specification-local',
        specificationId: 8,
      }),
    ).toEqual({
      kind: 'requirements_specification',
      specificationId: 8,
    })
  })

  it('rejects an invalid destination state', () => {
    expect(() => requirementImportDestination({ mode: 'library' })).toThrow(
      'Invalid requirement import scope',
    )
  })
})

describe('AI requirement import shared contracts', () => {
  beforeEach(() => {
    clearInMemoryThrottleForTests()
  })

  it('validates localized image type, base64 shape, padding, and size', () => {
    const schema = z
      .object({
        images: z.array(z.object({ dataUrl: z.string() })).optional(),
        locale: z.enum(['en', 'sv']).optional(),
      })
      .superRefine(validateRequirementImportImages)

    expect(
      schema.safeParse({
        images: [
          { dataUrl: 'data:image/png;base64,YQ' },
          { dataUrl: 'data:image/jpeg;base64,YWI' },
          { dataUrl: 'data:image/gif;base64,YWJjZA==' },
          { dataUrl: 'data:image/webp;base64,YWJjZGU=' },
        ],
      }).success,
    ).toBe(true)
    const invalid = schema.safeParse({
      images: [
        { dataUrl: 'plain text' },
        { dataUrl: 'data:image/svg+xml;base64,YQ==' },
        { dataUrl: 'data:image/png;base64,' },
        { dataUrl: 'data:image/png;base64,A' },
        { dataUrl: 'data:image/png;base64,Y Q==' },
      ],
      locale: 'sv',
    })

    expect(invalid.success).toBe(false)
    if (!invalid.success) {
      expect(invalid.error.issues).toHaveLength(5)
      expect(
        invalid.error.issues.every(issue => issue.path[0] === 'images'),
      ).toBe(true)
    }
  })

  it('bounds image data URLs before decoded image validation', () => {
    expect(
      imageDataUrlSchema.safeParse('x'.repeat(MAX_AI_IMAGE_DATA_URL_LENGTH + 1))
        .success,
    ).toBe(false)
  })

  it('validates both destination scopes and returns their authorization actions', () => {
    const scopeSchema = z
      .object({
        areaId: z.number().optional(),
        locale: z.enum(['en', 'sv']).optional(),
        mode: z.enum(['library', 'specification-local']),
        specificationId: z.number().optional(),
      })
      .superRefine(validateRequirementImportScope)

    expect(isValidRequirementImportScope({ areaId: 2, mode: 'library' })).toBe(
      true,
    )
    expect(
      isValidRequirementImportScope({
        mode: 'specification-local',
        specificationId: 7,
      }),
    ).toBe(true)
    expect(
      scopeSchema.safeParse({
        areaId: 2,
        locale: 'sv',
        mode: 'specification-local',
      }).success,
    ).toBe(false)
    expect(
      requirementImportScopeAction({ areaId: 2, mode: 'library' }),
    ).toEqual({
      kind: 'generate_requirements',
      scopeId: 2,
      scopeType: 'requirement_area',
    })
    expect(
      requirementImportScopeAction({
        mode: 'specification-local',
        specificationId: 7,
      }),
    ).toEqual({
      kind: 'generate_requirements',
      scopeId: 7,
      scopeType: 'specification',
    })
  })

  it('uses a generic localized safety-rule label when no rule id is available', () => {
    const decision = makeDecision({ allowed: false })

    expect(
      formatAiSafetyBlockedMessage('en', 'inputSafetyBlocked', decision),
    ).toContain('AI safety rule')
    expect(
      formatAiSafetyBlockedMessage('sv', 'outputSafetyBlocked', decision),
    ).toContain('AI-säkerhetsregel')
  })

  it('builds image content and counts the submitted image bytes', () => {
    const images = [
      { dataUrl: 'data:image/png;base64,YQ==' },
      { dataUrl: 'data:image/png;base64,YWJj' },
    ]

    expect(toAiTaskContent('prompt', [])).toEqual([
      { text: 'prompt', type: 'text' },
    ])
    expect(toAiTaskContent('prompt', images)).toEqual([
      { text: 'prompt', type: 'text' },
      { data: new Uint8Array([97]), mediaType: 'image/png', type: 'image' },
      {
        data: new Uint8Array([97, 98, 99]),
        mediaType: 'image/png',
        type: 'image',
      },
    ])
    expect(countImageBytes(images)).toBe(6)
  })

  it('uses HSA and correlation identities for independent throttles', () => {
    const hsaContext = makeContext()
    hsaContext.actor.id = null
    const correlationContext = makeContext()
    correlationContext.actor.id = null
    correlationContext.actor.hsaId = null

    for (let requestCount = 0; requestCount < 5; requestCount += 1) {
      expect(
        checkAiRequirementImportThrottle(hsaContext, 'ai.generate').allowed,
      ).toBe(true)
    }
    expect(
      checkAiRequirementImportThrottle(hsaContext, 'ai.generate').allowed,
    ).toBe(false)
    expect(
      checkAiRequirementImportThrottle(correlationContext, 'ai.generate')
        .allowed,
    ).toBe(true)
  })

  it('returns a correlated unavailable stream and records its terminal failure', async () => {
    const recordFailure = vi.fn()

    const response = createUnavailableAiStreamResponse(
      makeContext(),
      recordFailure,
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(await response.text()).toContain('event: error')
    expect(recordFailure).toHaveBeenCalledOnce()
  })
})
