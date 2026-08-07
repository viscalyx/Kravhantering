import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  accessReviewAuditActor,
  accessReviewServiceActor,
  recordAccessReviewActionSucceeded,
  recordAccessReviewAuthorizationDenied,
} from '@/lib/access-review/route-audit'
import { forbiddenError } from '@/lib/requirements/errors'
import { authenticatedRestContextFixture } from './helpers/authenticated-rest-context-fixture'

const mocks = vi.hoisted(() => ({
  db: { query: vi.fn() },
  getRequestSqlServerDataSource: vi.fn(),
  recordAllowedActionAuditEvent: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
  recordSecurityEvent: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: mocks.recordAllowedActionAuditEvent,
  recordDeniedActionAuditEvent: mocks.recordDeniedActionAuditEvent,
}))
vi.mock('@/lib/auth/audit', () => ({
  recordSecurityEvent: mocks.recordSecurityEvent,
}))

describe('access-review route audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRequestSqlServerDataSource.mockResolvedValue(mocks.db)
  })

  it('records allowed and denied evidence with bounded details', async () => {
    const requestContext = authenticatedRestContextFixture()
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

    const request = new Request(
      'https://example.test/api/admin/access-reviews/42',
    )
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

    await recordAccessReviewAuthorizationDenied(
      null,
      request,
      {},
      forbiddenError('Denied'),
    )
    await recordAccessReviewAuthorizationDenied(
      requestContext,
      request,
      {},
      new Error('boom'),
    )
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
})
