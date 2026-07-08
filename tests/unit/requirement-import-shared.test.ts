import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  guardAiInput,
  requirementImportDestination,
} from '@/app/api/ai/requirement-import-shared'
import type { AiSafetyDecision, AiSafetyScreeningResult } from '@/lib/ai/safety'
import type { SqlServerDatabase } from '@/lib/db'
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
})
