import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CsrfError } from '@/lib/auth/csrf'
import { forbiddenError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  buildAccessReviewExport: vi.fn(),
  cancelAccessReviewRun: vi.fn(),
  completeAccessReviewRun: vi.fn(),
  createAccessReviewRun: vi.fn(),
  createRequestContext: vi.fn(),
  decideAccessReviewItem: vi.fn(),
  getAccessReviewRun: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  listAccessReviewRuns: vi.fn(),
  recordAllowedActionAuditEvent: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
  recordSecurityEvent: vi.fn(),
  renderPdfResponse: vi.fn((_document, _filename) =>
    Promise.resolve(
      new Response('%PDF', {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="access-review.pdf"',
          'Content-Type': 'application/pdf',
        },
      }),
    ),
  ),
  requireHumanActorSnapshot: vi.fn(
    (context: { actor: { displayName: string; hsaId: string } }) => ({
      displayName: context.actor.displayName,
      hsaId: context.actor.hsaId,
    }),
  ),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/auth/audit', () => ({
  recordSecurityEvent: routeState.recordSecurityEvent,
}))

vi.mock('@/lib/audit/action-audit', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/audit/action-audit')>()
  return {
    ...actual,
    recordAllowedActionAuditEvent: routeState.recordAllowedActionAuditEvent,
    recordDeniedActionAuditEvent: routeState.recordDeniedActionAuditEvent,
  }
})

vi.mock('@/lib/http/safe-errors', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/http/safe-errors')>()
  return {
    ...actual,
    logSanitizedError: vi.fn(),
  }
})

vi.mock('@/lib/access-review/service', () => ({
  buildAccessReviewExport: routeState.buildAccessReviewExport,
  cancelAccessReviewRun: routeState.cancelAccessReviewRun,
  completeAccessReviewRun: routeState.completeAccessReviewRun,
  createAccessReviewRun: routeState.createAccessReviewRun,
  decideAccessReviewItem: routeState.decideAccessReviewItem,
  getAccessReviewRun: routeState.getAccessReviewRun,
  listAccessReviewRuns: routeState.listAccessReviewRuns,
}))

vi.mock('@/components/access-review/AccessReviewExportPdfRenderer', () => ({
  default: () => null,
}))

vi.mock('@/lib/pdf/server-response', () => ({
  renderPdfResponse: routeState.renderPdfResponse,
}))

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createRequestContext: routeState.createRequestContext,
    requireHumanActorSnapshot: routeState.requireHumanActorSnapshot,
  }
})

function context(roles: string[] = ['Admin']) {
  return {
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles,
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    request: new Request('http://localhost/api/admin/access-reviews'),
    requestId: 'request-1',
    source: 'rest',
  }
}

function reviewDetail() {
  return {
    items: [
      {
        comment: null,
        createdAt: '2026-05-12T12:00:00.000Z',
        decidedAt: null,
        decidedBy: null,
        decision: 'pending',
        id: 7,
        permissionType: 'area_co_author',
        principal: {
          displayName: 'Kalle Svensson',
          hsaId: 'SE5560000001-kalle1',
        },
        scope: {
          key: '1',
          label: 'INT Integration',
          type: 'requirement_area',
        },
        sourceKey: 'requirement_area_co_authors.hsa_id',
        sourceTable: 'requirement_area_co_authors',
      },
    ],
    run: {
      completedAt: null,
      completedBy: null,
      createdAt: '2026-05-12T12:00:00.000Z',
      createdBy: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
      },
      dueAt: '2026-06-11T12:00:00.000Z',
      externalEvidenceReference: 'IDM-2026',
      id: 42,
      periodEnd: '2027-05-12T12:00:00.000Z',
      periodStart: '2026-05-12T12:00:00.000Z',
      reviewer: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
      },
      status: 'in_review',
      summary: {
        approvedCount: 0,
        changedCount: 0,
        itemCount: 1,
        notApplicableCount: 0,
        pendingCount: 1,
        revokeRequiredCount: 0,
      },
      updatedAt: '2026-05-12T12:00:00.000Z',
    },
  }
}

function jsonRequest(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  })
}

describe('access review routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequestContext.mockResolvedValue(context())
    routeState.createAccessReviewRun.mockResolvedValue(reviewDetail())
    routeState.listAccessReviewRuns.mockResolvedValue([reviewDetail().run])
    routeState.getAccessReviewRun.mockResolvedValue(reviewDetail())
    routeState.decideAccessReviewItem.mockResolvedValue({
      ...reviewDetail(),
      run: {
        ...reviewDetail().run,
        summary: { ...reviewDetail().run.summary, pendingCount: 0 },
      },
    })
    routeState.completeAccessReviewRun.mockResolvedValue({
      ...reviewDetail(),
      run: { ...reviewDetail().run, status: 'completed' },
    })
    routeState.cancelAccessReviewRun.mockResolvedValue({
      ...reviewDetail(),
      run: { ...reviewDetail().run, status: 'cancelled' },
    })
    routeState.renderPdfResponse.mockClear()
    routeState.buildAccessReviewExport.mockResolvedValue({
      ...reviewDetail(),
      generatedAt: '2026-05-12T12:30:00.000Z',
      generatedBy: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
      },
      limitations: [],
      schemaVersion: 'access-review-export.v1',
    })
  })

  it('creates a review run and audits counts without raw reviewed HSA-id lists', async () => {
    const auditExecutor = { query: vi.fn() }
    routeState.createAccessReviewRun.mockImplementationOnce(
      async (_db, _input, _actor, options) => {
        await options?.audit?.(auditExecutor, {
          itemCount: 1,
          runId: 42,
          status: 'in_review',
        })
        return reviewDetail()
      },
    )
    const { POST } = await import('@/app/api/admin/access-reviews/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews', {
        externalEvidenceReference: 'IDM-2026',
      }) as never,
    )

    expect(response.status).toBe(201)
    expect(routeState.createAccessReviewRun).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        externalEvidenceReference: 'IDM-2026',
        reviewer: {
          displayName: 'Ada Admin',
          hsaId: 'SE5560000001-admin1',
        },
      }),
      expect.objectContaining({ roles: ['Admin'] }),
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(routeState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      auditExecutor,
      expect.objectContaining({ requestId: 'request-1' }),
      expect.objectContaining({
        action: 'access_review.create',
        targetId: 42,
        targetKind: 'AccessReview',
      }),
    )
    const auditArg = routeState.recordSecurityEvent.mock.calls[0][0]
    expect(auditArg.event).toBe('access_review.created')
    expect(auditArg.detail).toEqual({
      itemCount: 1,
      reviewId: 42,
      status: 'in_review',
    })
    expect(JSON.stringify(auditArg.detail)).not.toContain('SE5560000001-kalle1')
  })

  it('rejects manually assigned reviewers on create', async () => {
    const { POST } = await import('@/app/api/admin/access-reviews/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews', {
        reviewer: {
          displayName: 'Rita Reviewer',
          hsaId: 'SE5560000001-reviewer1',
        },
      }) as never,
    )

    expect(response.status).toBe(400)
    expect(routeState.createAccessReviewRun).not.toHaveBeenCalled()
  })

  it('returns service authorization failures for forbidden create', async () => {
    routeState.createAccessReviewRun.mockRejectedValueOnce(
      forbiddenError('Admin or PrivacyOfficer role is required', {
        reason: 'access_review_role_required',
      }),
    )
    const { POST } = await import('@/app/api/admin/access-reviews/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews', {}) as never,
    )

    expect(response.status).toBe(403)
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          actionKind: 'access_review.create',
          errorCode: 'forbidden',
          reason: 'access_review_role_required',
          requestSource: 'rest',
        },
        event: 'auth.authorization.denied',
        outcome: 'failure',
      }),
    )
  })

  it('rejects create when CSRF validation fails before opening the database', async () => {
    routeState.createRequestContext.mockRejectedValueOnce(
      new CsrfError('Missing X-Requested-With header.'),
    )
    const { POST } = await import('@/app/api/admin/access-reviews/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews', {}) as never,
    )

    expect(response.status).toBe(403)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.createAccessReviewRun).not.toHaveBeenCalled()
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('decides an assigned review item', async () => {
    const { PATCH } = await import(
      '@/app/api/admin/access-reviews/[id]/items/[itemId]/route'
    )
    const response = await PATCH(
      jsonRequest(
        'http://localhost/api/admin/access-reviews/42/items/7',
        {
          comment: 'Still needed',
          decision: 'approved',
        },
        'PATCH',
      ) as never,
      { params: Promise.resolve({ id: '42', itemId: '7' }) },
    )

    expect(response.status).toBe(200)
    expect(routeState.decideAccessReviewItem).toHaveBeenCalledWith(
      { db: true },
      42,
      7,
      { comment: 'Still needed', decision: 'approved' },
      expect.objectContaining({ hsaId: 'SE5560000001-admin1' }),
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { decision: 'approved', itemId: 7, reviewId: 42 },
        event: 'access_review.item_decided',
      }),
    )
  })

  it('blocks invalid decisions before opening the database', async () => {
    const { PATCH } = await import(
      '@/app/api/admin/access-reviews/[id]/items/[itemId]/route'
    )
    const response = await PATCH(
      jsonRequest(
        'http://localhost/api/admin/access-reviews/42/items/7',
        { decision: 'pending' },
        'PATCH',
      ) as never,
      { params: Promise.resolve({ id: '42', itemId: '7' }) },
    )

    expect(response.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.decideAccessReviewItem).not.toHaveBeenCalled()
  })

  it('rejects item decisions when CSRF validation fails before opening the database', async () => {
    routeState.createRequestContext.mockRejectedValueOnce(
      new CsrfError('Missing X-Requested-With header.'),
    )
    const { PATCH } = await import(
      '@/app/api/admin/access-reviews/[id]/items/[itemId]/route'
    )
    const response = await PATCH(
      jsonRequest(
        'http://localhost/api/admin/access-reviews/42/items/7',
        { comment: 'Still needed', decision: 'approved' },
        'PATCH',
      ) as never,
      { params: Promise.resolve({ id: '42', itemId: '7' }) },
    )

    expect(response.status).toBe(403)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.decideAccessReviewItem).not.toHaveBeenCalled()
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('cancels an access review run and audits the state change', async () => {
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/cancel/route'
    )
    const response = await POST(
      new Request('http://localhost/api/admin/access-reviews/42/cancel', {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    expect(routeState.cancelAccessReviewRun).toHaveBeenCalledWith(
      { db: true },
      42,
      expect.objectContaining({ hsaId: 'SE5560000001-admin1' }),
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { itemCount: 1, reviewId: 42, status: 'cancelled' },
        event: 'access_review.cancelled',
      }),
    )
  })

  it('rejects cancelling when CSRF validation fails before opening the database', async () => {
    routeState.createRequestContext.mockRejectedValueOnce(
      new CsrfError('Missing X-Requested-With header.'),
    )
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/cancel/route'
    )
    const response = await POST(
      new Request('http://localhost/api/admin/access-reviews/42/cancel', {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(403)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.cancelAccessReviewRun).not.toHaveBeenCalled()
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('exports JSON with no-store headers', async () => {
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/export/route'
    )
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews/42/export', {
        delivery: 'json',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )
    const body = (await response.json()) as { schemaVersion: string }

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body.schemaVersion).toBe('access-review-export.v1')
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          delivery: 'json',
          itemCount: 1,
          reviewId: 42,
          status: 'in_review',
        },
        event: 'access_review.exported',
      }),
    )
  })

  it('exports PDF as binary while keeping JSON delivery separate', async () => {
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/export/route'
    )
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews/42/export', {
        delivery: 'pdf',
        locale: 'en',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.renderPdfResponse).toHaveBeenCalledWith(
      expect.any(Object),
      'access-review-0042-2026-05-12.pdf',
    )
    expect(routeState.renderPdfResponse.mock.calls[0][0].props.locale).toBe(
      'en',
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          delivery: 'pdf',
          itemCount: 1,
          reviewId: 42,
          status: 'in_review',
        },
        event: 'access_review.exported',
      }),
    )
  })

  it('rejects exports with no-store headers when CSRF validation fails before opening the database', async () => {
    routeState.createRequestContext.mockRejectedValueOnce(
      new CsrfError('Missing X-Requested-With header.'),
    )
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/export/route'
    )
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews/42/export', {
        delivery: 'json',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.buildAccessReviewExport).not.toHaveBeenCalled()
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })
})
