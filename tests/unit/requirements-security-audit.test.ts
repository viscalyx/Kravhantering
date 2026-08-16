import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RequestContext,
  RequirementsAction,
} from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'
import {
  recordAuthorizationDenied,
  recordAuthorizationDeniedAuditFailure,
  recordSensitiveMutationActionAuditEvent,
  recordSensitiveMutationSecurityEvent,
  recordSensitiveMutationSucceeded,
} from '@/lib/requirements/security-audit'

const mocks = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(),
  recordAllowedActionAuditEvent: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: mocks.recordAllowedActionAuditEvent,
  recordDeniedActionAuditEvent: mocks.recordDeniedActionAuditEvent,
}))

function context(): RequestContext {
  return {
    actor: {
      displayName: 'Audit Actor',
      hsaId: 'SE5560000001-audit',
      id: 'actor-audit',
      isAuthenticated: true,
      roles: ['Reviewer'],
      source: 'mcp',
    },
    correlationId: 'corr-audit',
    requestId: 'req-audit',
    source: 'mcp',
    toolName: 'requirements_manage_import',
  }
}

describe('requirements security audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRequestSqlServerDataSource.mockResolvedValue({
      transaction: vi.fn(
        async (
          callback: (manager: { query: ReturnType<typeof vi.fn> }) => unknown,
        ) => callback({ query: vi.fn() }),
      ),
    })
  })

  it('persists required Action log evidence for an authorization denial', async () => {
    const denied = forbiddenError('Blocked by policy', {
      reason: 'policy_missing',
      requiredRoles: ['Admin'],
    })
    const action: RequirementsAction = {
      kind: 'manage_import',
      operation: 'validate',
    }

    await expect(
      recordAuthorizationDenied(context(), action, denied),
    ).resolves.toBeUndefined()

    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'mcp' }),
      expect.objectContaining({
        action: 'manage_import.denied',
        denialReason: 'policy_missing',
        targetKind: 'manage_import',
      }),
    )
  })

  it('fails closed with a redacted diagnostic when denial evidence cannot persist', async () => {
    const infoSpy = vi
      .spyOn(console, 'info')
      .mockImplementation(() => undefined)
    try {
      mocks.getRequestSqlServerDataSource.mockRejectedValueOnce(
        new Error('DATABASE_URL password=supersecret must be configured'),
      )
      const denied = forbiddenError('Blocked by policy', {
        reason: 'policy_missing',
        requiredRoles: ['Admin'],
      })
      const action: RequirementsAction = {
        kind: 'manage_import',
        operation: 'validate',
      }

      await expect(
        recordAuthorizationDenied(context(), action, denied),
      ).rejects.toMatchObject({
        code: 'internal',
        message: 'An internal error occurred',
        status: 500,
      })

      expect(mocks.recordDeniedActionAuditEvent).not.toHaveBeenCalled()
      const events = infoSpy.mock.calls.map(
        call => JSON.parse(String(call[0])) as Record<string, unknown>,
      )
      expect(events.map(event => event.event)).toEqual([
        'auth.authorization.denied',
        'auth.authorization.denied.audit_failed',
      ])

      const diagnostic = events.find(
        event => event.event === 'auth.authorization.denied.audit_failed',
      )
      if (!diagnostic) {
        throw new Error('Expected authorization audit failure diagnostic')
      }
      const detail = diagnostic.detail as Record<string, unknown>
      expect(detail).toMatchObject({
        auditFailure: 'denied_action_audit_write_failed',
        auditFailureName: 'Error',
        errorCode: 'forbidden',
        reason: 'policy_missing',
      })
      expect(String(detail.auditFailureMessage)).toContain('DATABASE_URL')
      expect(String(detail.auditFailureMessage)).not.toContain('supersecret')
    } finally {
      infoSpy.mockRestore()
    }
  })

  it.each<RequirementsAction>([
    { catalog: 'requirements', kind: 'query_catalog' },
    { kind: 'get_import_schema' },
    { kind: 'get_import_instruction' },
    { kind: 'manage_norm_reference', operation: 'create' },
    { kind: 'list_specifications' },
    { kind: 'get_specification_items', specificationId: 1 },
    { kind: 'list_deviations', specificationId: 1 },
    {
      kind: 'add_to_specification',
      requirementIds: [1, 2],
      specificationId: 1,
    },
    {
      kind: 'remove_from_specification',
      requirementIds: [1],
      specificationId: 1,
    },
    {
      itemRefs: ['lib:1', 'local:2'],
      kind: 'manage_requirement_applications',
      operation: 'remove',
      specificationId: 1,
    },
    {
      kind: 'manage_specification_requirement_selection_answers',
      operation: 'replace',
      specificationId: 1,
    },
    {
      kind: 'list_graduation_target_areas',
      localRequirementId: 2,
      specificationId: 1,
    },
    {
      kind: 'graduate_specification_local_requirement',
      localRequirementId: 2,
      requirementAreaId: 3,
      specificationId: 1,
    },
    {
      kind: 'manage_specification_local_requirement',
      localRequirementId: 2,
      operation: 'edit',
      specificationId: 1,
    },
    {
      kind: 'manage_specification_needs_reference',
      needsReferenceId: 2,
      operation: 'edit',
      specificationId: 1,
    },
    { id: 1, kind: 'get_requirement', uniqueId: 'REQ1', view: 'detail' },
    { id: 1, kind: 'manage_requirement', operation: 'edit', uniqueId: 'REQ1' },
    { id: 1, kind: 'transition_requirement', toStatusId: 2, uniqueId: 'REQ1' },
    { deviationId: 1, kind: 'manage_deviation', operation: 'edit' },
    { kind: 'list_suggestions', requirementId: 1 },
    { kind: 'manage_suggestion', operation: 'edit', suggestionId: 1 },
    {
      areaId: 1,
      kind: 'manage_rfi_question',
      operation: 'edit',
      questionId: 2,
    },
    { kind: 'manage_specification_rfi', operation: 'lock', specificationId: 1 },
    {
      areaId: 1,
      kind: 'manage_rfi_question_suggestion',
      operation: 'edit',
      suggestionId: 2,
      specificationId: 3,
    },
    {
      kind: 'generate_requirements',
      scopeId: 1,
      scopeType: 'requirement_area',
    },
  ])('records bounded denial evidence for $kind', async action => {
    await recordAuthorizationDenied(
      context(),
      action,
      forbiddenError('Denied', { reason: 'assignment_required' }),
    )

    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ denialReason: 'assignment_required' }),
    )
  })

  it.each<{
    action: RequirementsAction
    expected: { action: string; targetId: number; targetKind: string }
  }>([
    {
      action: {
        itemRefs: ['lib:2'],
        kind: 'manage_requirement_applications',
        operation: 'update',
        specificationId: 1,
      },
      expected: {
        action: 'specification.requirement_application.update.denied',
        targetId: 1,
        targetKind: 'RequirementsSpecification',
      },
    },
    {
      action: {
        kind: 'manage_specification_requirement_selection_answers',
        operation: 'replace',
        specificationId: 1,
      },
      expected: {
        action: 'specification_requirement_selection_answer.replace.denied',
        targetId: 1,
        targetKind: 'RequirementsSpecification',
      },
    },
    {
      action: {
        childKind: 'deviation_collection',
        kind: 'get_specification_child',
        specificationId: 1,
      },
      expected: {
        action: 'get_specification_child.denied',
        targetId: 1,
        targetKind: 'RequirementsSpecification',
      },
    },
    {
      action: { kind: 'get_improvement_suggestion', suggestionId: 2 },
      expected: {
        action: 'improvement_suggestion.read.denied',
        targetId: 2,
        targetKind: 'ImprovementSuggestion',
      },
    },
    {
      action: {
        kind: 'manage_suggestion',
        operation: 'create',
        requirementId: 3,
      },
      expected: {
        action: 'improvement_suggestion.create.denied',
        targetId: 3,
        targetKind: 'ImprovementSuggestion',
      },
    },
  ])(
    'persists scoped denial target evidence for $action.kind',
    async ({ action, expected }) => {
      await recordAuthorizationDenied(
        context(),
        action,
        forbiddenError('Denied', { reason: 'assignment_required' }),
      )

      expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining(expected),
      )
    },
  )

  it('ignores unrelated failures and sanitizes non-Error audit failures', async () => {
    await recordAuthorizationDenied(
      context(),
      { kind: 'get_import_schema' },
      new Error('boom'),
    )
    expect(mocks.recordDeniedActionAuditEvent).not.toHaveBeenCalled()

    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() =>
      recordAuthorizationDeniedAuditFailure(context(), circular),
    ).not.toThrow()
    expect(() =>
      recordAuthorizationDeniedAuditFailure(context(), 'token=secret'),
    ).not.toThrow()
  })

  it.each([
    {
      action: 'requirement.created',
      newRequirementId: 1,
      newRequirementUniqueId: 'REQ1',
    },
    {
      action: 'requirement.edited',
      requirementId: 2,
      requirementUniqueId: 'REQ2',
    },
    { action: 'deviation.decision.recorded', deviationId: 3 },
    {
      action: 'suggestion.resolution.recorded',
      operation: 'dismiss',
      suggestionId: 4,
    },
    {
      action: 'suggestion.resolution.recorded',
      operation: 'resolve',
      suggestionId: 4,
    },
    { action: 'suggestion.created', suggestionId: 4 },
    { action: 'local.edited', localRequirementId: 5 },
    { action: 'specification.edited', specificationId: 6 },
    { action: 'fallback' },
  ])('maps sensitive mutation target evidence for $action', async detail => {
    await recordSensitiveMutationActionAuditEvent(
      { query: vi.fn() },
      context(),
      detail,
    )
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalled()
    recordSensitiveMutationSecurityEvent(context(), detail)
  })

  it('uses the request data source for successful mutation evidence', async () => {
    const db = { query: vi.fn() }
    mocks.getRequestSqlServerDataSource.mockResolvedValueOnce(db)
    await recordSensitiveMutationSucceeded(context(), {
      action: 'requirement.created',
      requirementId: 1,
    })
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      db,
      expect.anything(),
      expect.anything(),
    )
  })
})
