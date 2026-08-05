import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accessReviewExportFilename } from '@/lib/access-review/export-filenames'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewActionSucceeded,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import { accessReviewErrorResponse } from '@/lib/access-review/route-helpers'
import type { AccessReviewExportV1 } from '@/lib/access-review/types'
import {
  actionAuditLogCsvHref,
  actionAuditLogFiltersFromSearchParams,
  actionAuditLogHref,
  actionAuditLogPageSize,
  firstSearchParamValue,
  pickActionAuditLogQuery,
} from '@/lib/audit/action-audit-query'
import { recordRequirementSelectionCleanupAudit } from '@/lib/audit/requirement-selection-cleanup-audit'
import { CsrfError } from '@/lib/auth/csrf'
import { dataSubjectExportFilename } from '@/lib/privacy/data-subject-export-filenames'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'
import {
  assertPrivacyOfficer,
  auditActor,
  unexpectedErrorBody,
} from '@/lib/privacy/route-helpers'
import type { RequestContext } from '@/lib/requirements/auth'
import { forbiddenError } from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => ({
  db: { query: vi.fn() },
  getRequestSqlServerDataSource: vi.fn(),
  recordActionAuditEvent: vi.fn(),
  recordAllowedActionAuditEvent: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
  recordSecurityEvent: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/audit/action-audit', () => ({
  recordActionAuditEvent: mocks.recordActionAuditEvent,
  recordAllowedActionAuditEvent: mocks.recordAllowedActionAuditEvent,
  recordDeniedActionAuditEvent: mocks.recordDeniedActionAuditEvent,
}))
vi.mock('@/lib/auth/audit', () => ({
  recordSecurityEvent: mocks.recordSecurityEvent,
}))

function context(): RequestContext {
  return {
    actor: {
      displayName: 'Reviewer',
      hsaId: 'SE5560000001-reviewer1',
      id: 'reviewer-sub',
      isAuthenticated: true,
      roles: ['Reviewer'],
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    request: {
      ip: '203.0.113.1',
      method: 'POST',
      path: '/api/admin/access-reviews/42',
      requestId: 'request-1',
    },
    requestId: 'request-1',
    source: 'rest',
  }
}

describe('accountability helper edge paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRequestSqlServerDataSource.mockResolvedValue(mocks.db)
  })

  it('creates deterministic fallback export filenames for invalid timestamps', () => {
    const access = {
      generatedAt: 'not a date!',
      run: { id: 7 },
    } as AccessReviewExportV1
    expect(accessReviewExportFilename(access, 'json')).toBe(
      'access-review-0007-export.json',
    )
    access.generatedAt = '2026-05-xx trailing'
    expect(accessReviewExportFilename(access, 'pdf', 'sv')).toBe(
      'behorighetsoversyn-0007-2026-05-.pdf',
    )

    const privacy = {
      generatedAt: '!',
      subject: { targetFingerprint: '0123456789abcdef' },
    } as DataSubjectExportV1
    expect(dataSubjectExportFilename(privacy, 'json')).toBe(
      'data-subject-access-export-0123456789abcdef-export.json',
    )
  })

  it('maps expected and unexpected access-review route errors', async () => {
    expect(
      accessReviewErrorResponse('Failed', new CsrfError('Denied')).status,
    ).toBe(403)
    expect(
      accessReviewErrorResponse('Failed', forbiddenError('Denied')).status,
    ).toBe(403)
    const response = accessReviewErrorResponse('Failed', new Error('secret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed' })

    vi.stubEnv('NODE_ENV', 'development')
    const development = accessReviewErrorResponse(
      'Failed',
      new Error('token=secret'),
    )
    expect(await development.json()).toMatchObject({
      debugMessage: expect.any(String),
      error: 'Failed',
    })
    vi.unstubAllEnvs()
  })

  it('covers privacy actor, authorization, and safe error variants', () => {
    const allowed = context()
    allowed.actor.roles = ['PrivacyOfficer']
    expect(() => assertPrivacyOfficer(allowed)).not.toThrow()
    expect(auditActor(allowed)).toEqual({
      hsaId: 'SE5560000001-reviewer1',
      source: 'oidc',
      sub: 'reviewer-sub',
    })

    allowed.actor.hsaId = null
    allowed.actor.id = null
    expect(auditActor(allowed)).toEqual({
      hsaId: undefined,
      source: 'oidc',
      sub: undefined,
    })
    expect(() => assertPrivacyOfficer(context())).toThrow()
    expect(unexpectedErrorBody('Failed', 'secret')).toEqual({ error: 'Failed' })
    vi.stubEnv('NODE_ENV', 'development')
    expect(unexpectedErrorBody('Failed', new Error('token=secret'))).toMatchObject(
      { debugMessage: expect.any(String), error: 'Failed' },
    )
    vi.unstubAllEnvs()
  })

  it('records allowed and denied access-review evidence with bounded details', async () => {
    const requestContext = context()
    expect(accessReviewAuditActor(requestContext)).toEqual({
      hsaId: 'SE5560000001-reviewer1',
      source: 'oidc',
      sub: 'reviewer-sub',
    })
    expect(accessReviewServiceActor(requestContext)).toMatchObject({
      displayName: 'Reviewer',
      roles: ['Reviewer'],
    })

    await recordAccessReviewActionSucceeded(requestContext, {
      action: 'access_review.completed',
      detail: { ignored: null, itemCount: 2 },
      targetId: 42,
    })
    await recordAccessReviewActionSucceeded(
      requestContext,
      { action: 'access_review.created' },
      mocks.db,
    )
    expect(mocks.recordAllowedActionAuditEvent).toHaveBeenCalledTimes(2)

    const request = new Request('https://example.test/api/admin/access-reviews/42')
    await recordAccessReviewAuthorizationDenied(
      requestContext,
      request,
      { actionKind: 'access_review.complete', reviewId: '42' },
      forbiddenError('Denied', { reason: 'reviewer_assignment_required' }),
    )
    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      requestContext,
      expect.objectContaining({
        action: 'access_review.complete.denied',
        denialReason: 'reviewer_assignment_required',
        targetId: '42',
      }),
    )
    expect(mocks.recordSecurityEvent).toHaveBeenCalled()

    await recordAccessReviewAuthorizationDenied(null, request, {}, forbiddenError('Denied'))
    await recordAccessReviewAuthorizationDenied(requestContext, request, {}, new Error('boom'))
    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenCalledTimes(1)

    requestContext.actor.hsaId = null
    requestContext.actor.id = null
    delete requestContext.request
    expect(accessReviewAuditActor(requestContext)).toEqual({
      hsaId: undefined,
      source: 'oidc',
      sub: undefined,
    })
    await recordAccessReviewAuthorizationDenied(
      requestContext,
      request,
      {},
      forbiddenError('Denied'),
    )
    expect(mocks.recordDeniedActionAuditEvent).toHaveBeenLastCalledWith(
      mocks.db,
      requestContext,
      expect.objectContaining({
        action: 'access_review.authorization.denied',
        denialReason: 'forbidden',
        targetId: null,
      }),
    )
  })

  it('records cleanup only when links were removed', async () => {
    await recordRequirementSelectionCleanupAudit(mocks.db, context(), {
      cleanup: {
        affectedAnswerIds: [],
        affectedRequirementIds: [],
        removedLinkCount: 0,
      },
      originAction: 'question.archive',
      originTargetKind: 'question',
    })
    expect(mocks.recordActionAuditEvent).not.toHaveBeenCalled()

    await recordRequirementSelectionCleanupAudit(mocks.db, context(), {
      cleanup: {
        affectedAnswerIds: [2],
        affectedRequirementIds: [3],
        removedLinkCount: 1,
      },
      originAction: 'question.archive',
      originTargetId: 1,
      originTargetKind: 'question',
    })
    expect(mocks.recordActionAuditEvent).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        actorKind: 'system',
        details: expect.objectContaining({ originTargetId: '1' }),
      }),
    )

    const requestless = context()
    delete requestless.request
    await recordRequirementSelectionCleanupAudit(mocks.db, requestless, {
      cleanup: {
        affectedAnswerIds: [],
        affectedRequirementIds: [],
        removedLinkCount: 1,
      },
      originAction: 'question.delete',
      originTargetKind: 'question',
    })
    expect(mocks.recordActionAuditEvent).toHaveBeenLastCalledWith(
      mocks.db,
      expect.objectContaining({
        clientIp: null,
        details: expect.objectContaining({ originTargetId: undefined }),
      }),
    )
  })

  it('normalizes action-log query arrays, bounds, links, and export filters', () => {
    expect(firstSearchParamValue(undefined)).toBeUndefined()
    expect(firstSearchParamValue(['first', 'second'])).toBe('first')
    expect(firstSearchParamValue([])).toBeUndefined()
    expect(actionAuditLogPageSize({ pageSize: '-1' })).toBe(50)
    expect(actionAuditLogPageSize({ pageSize: '9999' })).toBe(9999)
    expect(actionAuditLogPageSize({ pageSize: '25' })).toBe(25)

    const query = pickActionAuditLogQuery({
      action: ['requirement.create', 'ignored'],
      decision: 'invalid',
      from: 'invalid',
      page: '0',
      pageSize: '25',
      to: '2026-08-04T12:00:00.000Z',
      unknown: 'ignored',
    })
    expect(query).not.toHaveProperty('unknown')
    expect(actionAuditLogFiltersFromSearchParams(query)).toMatchObject({
      action: 'requirement.create',
      page: undefined,
      pageSize: 25,
    })
    expect(actionAuditLogHref({ basePath: '/audit', query: {} })).toBe('/audit')
    expect(
      actionAuditLogFiltersFromSearchParams({
        clientIp: 'not-an-ip',
        from: '2026-08-04T12:00',
      }).from,
    ).toEqual(new Date('2026-08-04T12:00:00.000Z'))
    expect(
      actionAuditLogHref({
        basePath: '/audit',
        overrides: { action: null, page: 2 },
        query: { action: 'requirement.create' },
      }),
    ).toBe('/audit?page=2')
    expect(actionAuditLogCsvHref({}, 'en')).toBe(
      '/api/admin/audit-events?locale=en&format=csv',
    )
  })
})
