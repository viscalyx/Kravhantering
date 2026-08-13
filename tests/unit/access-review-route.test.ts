import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CsrfError } from '@/lib/auth/csrf'
import {
  forbiddenError,
  serviceUnavailableError,
} from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  auditExecutor: { query: vi.fn() },
  buildAccessReviewExport: vi.fn(),
  cancelAccessReviewRun: vi.fn(),
  completeAccessReviewRun: vi.fn(),
  createAccessReviewRun: vi.fn(),
  createRequestContext: vi.fn(),
  decideAccessReviewItem: vi.fn(),
  getAccessReviewRun: vi.fn(),
  getApplicationSettings: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  listAccessReviewRuns: vi.fn(),
  recordAllowedActionAuditEvent: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
  recordSecurityEvent: vi.fn(),
  requireAccessReviewRole: vi.fn(),
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

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: routeState.getApplicationSettings,
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
  requireAccessReviewRole: routeState.requireAccessReviewRole,
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

function jsonRequest(
  url: string,
  body: unknown,
  method = 'POST',
  signal?: AbortSignal,
): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
    signal,
  })
}

describe('access review routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequestContext.mockResolvedValue(context())
    routeState.getApplicationSettings.mockResolvedValue({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
    })
    routeState.createAccessReviewRun.mockResolvedValue(reviewDetail())
    routeState.listAccessReviewRuns.mockResolvedValue([reviewDetail().run])
    routeState.getAccessReviewRun.mockResolvedValue(reviewDetail())
    routeState.decideAccessReviewItem.mockImplementation(
      async (_db, runId, itemId, input, _actor, options) => {
        await options?.audit?.(routeState.auditExecutor, {
          decision: input.decision,
          itemId,
          runId,
        })
        return {
          applied: true,
          detail: {
            ...reviewDetail(),
            run: {
              ...reviewDetail().run,
              summary: { ...reviewDetail().run.summary, pendingCount: 0 },
            },
          },
        }
      },
    )
    routeState.completeAccessReviewRun.mockImplementation(
      async (_db, runId, _actor, options) => {
        await options?.audit?.(routeState.auditExecutor, {
          itemCount: 1,
          runId,
          status: 'completed',
        })
        return {
          applied: true,
          detail: {
            ...reviewDetail(),
            run: { ...reviewDetail().run, status: 'completed' },
          },
        }
      },
    )
    routeState.cancelAccessReviewRun.mockImplementation(
      async (_db, runId, _actor, options) => {
        await options?.audit?.(routeState.auditExecutor, {
          itemCount: 1,
          runId,
          status: 'cancelled',
        })
        return {
          applied: true,
          detail: {
            ...reviewDetail(),
            run: { ...reviewDetail().run, status: 'cancelled' },
          },
        }
      },
    )
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

  it('accepts ordered equal instants with offsets and an independent due date', async () => {
    const { POST } = await import('@/app/api/admin/access-reviews/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews', {
        dueAt: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-05-12T12:00:00.000Z',
        periodStart: '2026-05-12T14:00:00.000+02:00',
      }) as never,
    )

    expect(response.status).toBe(201)
    expect(routeState.createAccessReviewRun).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        dueAt: new Date('2026-01-01T00:00:00.000Z'),
        periodEnd: new Date('2026-05-12T12:00:00.000Z'),
        periodStart: new Date('2026-05-12T12:00:00.000Z'),
      }),
      expect.anything(),
      expect.anything(),
    )
  })

  it('rejects parser-coercible timestamps that are not ISO timestamps', async () => {
    const parserCoercibleTimestamp = 'May 12, 2026 12:00:00 UTC'
    expect(Number.isNaN(new Date(parserCoercibleTimestamp).getTime())).toBe(
      false,
    )

    const { POST } = await import('@/app/api/admin/access-reviews/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews', {
        periodStart: parserCoercibleTimestamp,
      }) as never,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'Invalid request',
      issues: [expect.objectContaining({ path: 'periodStart' })],
    })
    expect(routeState.createAccessReviewRun).not.toHaveBeenCalled()
  })

  it('rejects explicitly reversed review periods before creating a run', async () => {
    const { POST } = await import('@/app/api/admin/access-reviews/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews', {
        periodEnd: '2026-05-12T12:00:00.000Z',
        periodStart: '2026-05-12T12:00:00.001Z',
      }) as never,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: 'Invalid request',
      issues: [
        expect.objectContaining({
          message:
            'Review period start must be earlier than or equal to its end.',
          path: 'periodEnd',
        }),
      ],
    })
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
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(routeState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      routeState.auditExecutor,
      expect.objectContaining({ requestId: 'request-1' }),
      expect.objectContaining({
        action: 'access_review.item_decide',
        targetId: 42,
        targetKind: 'AccessReview',
      }),
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          changed: true,
          decision: 'approved',
          itemId: 7,
          reviewId: 42,
        },
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
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(routeState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      routeState.auditExecutor,
      expect.objectContaining({ requestId: 'request-1' }),
      expect.objectContaining({
        action: 'access_review.cancel',
        targetId: 42,
        targetKind: 'AccessReview',
      }),
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          changed: true,
          itemCount: 1,
          reviewId: 42,
          status: 'cancelled',
        },
        event: 'access_review.cancelled',
      }),
    )
  })

  it('preserves the response contract and logs changed false for accepted no-op completion retries', async () => {
    const completedDetail = {
      ...reviewDetail(),
      run: { ...reviewDetail().run, status: 'completed' },
    }
    routeState.completeAccessReviewRun.mockResolvedValueOnce({
      applied: false,
      detail: completedDetail,
    })
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/complete/route'
    )
    const response = await POST(
      new Request('http://localhost/api/admin/access-reviews/42/complete', {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(completedDetail)
    expect(routeState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          changed: false,
          itemCount: 1,
          reviewId: 42,
          status: 'completed',
        },
        event: 'access_review.completed',
      }),
    )
  })

  it('maps a retryable completion conflict to service unavailable', async () => {
    routeState.completeAccessReviewRun.mockRejectedValueOnce(
      serviceUnavailableError(
        'Access review completion was interrupted by a database conflict. Try again.',
        { reason: 'access_review_completion_retry' },
      ),
    )
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/complete/route'
    )
    const response = await POST(
      new Request('http://localhost/api/admin/access-reviews/42/complete', {
        method: 'POST',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      code: 'service_unavailable',
      error:
        'Access review completion was interrupted by a database conflict. Try again.',
    })
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
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
    routeState.getApplicationSettings.mockResolvedValueOnce({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1,
      pdfReportTimeoutSeconds: 180,
    })
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
      { capacity: expect.objectContaining({ output: 'pdf' }) },
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

  it('does not record PDF export success when rendering fails', async () => {
    routeState.renderPdfResponse.mockRejectedValueOnce(
      new Error('PDF render failed'),
    )
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/export/route'
    )

    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews/42/export', {
        delivery: 'pdf',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(500)
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('does not record PDF export success when cancellation occurs during rendering', async () => {
    const controller = new AbortController()
    routeState.renderPdfResponse.mockImplementationOnce(async () => {
      controller.abort()
      return new Response('%PDF')
    })
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/export/route'
    )

    const response = await POST(
      jsonRequest(
        'http://localhost/api/admin/access-reviews/42/export',
        { delivery: 'pdf' },
        'POST',
        controller.signal,
      ) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(499)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('authorizes PDF exports before reading generation settings', async () => {
    routeState.requireAccessReviewRole.mockImplementationOnce(() => {
      throw forbiddenError('Admin or PrivacyOfficer role is required', {
        reason: 'access_review_role_required',
      })
    })
    routeState.createRequestContext.mockResolvedValueOnce(context(['Reviewer']))
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/export/route'
    )

    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews/42/export', {
        delivery: 'pdf',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(403)
    expect(routeState.getApplicationSettings).not.toHaveBeenCalled()
    expect(routeState.buildAccessReviewExport).not.toHaveBeenCalled()
  })

  it('rejects an oversized PDF access review before rendering', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1,
      pdfReportTimeoutSeconds: 180,
    })
    routeState.buildAccessReviewExport.mockImplementationOnce(
      async (_db, _id, _actor, _generatedAt, itemLimit) => {
        throw itemLimit.createItemLimitError(itemLimit.maxItems)
      },
    )
    const { POST } = await import(
      '@/app/api/admin/access-reviews/[id]/export/route'
    )

    const response = await POST(
      jsonRequest('http://localhost/api/admin/access-reviews/42/export', {
        delivery: 'pdf',
      }) as never,
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.renderPdfResponse).not.toHaveBeenCalled()
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

  it('lists and loads assigned access reviews through the read routes', async () => {
    const { GET: list } = await import('@/app/api/admin/access-reviews/route')
    const listResponse = await list(
      new Request('http://localhost/api/admin/access-reviews') as never,
    )
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual({ runs: [reviewDetail().run] })

    const { GET: detail } = await import(
      '@/app/api/admin/access-reviews/[id]/route'
    )
    const detailResponse = await detail(
      new Request('http://localhost/api/admin/access-reviews/42') as never,
      { params: Promise.resolve({ id: '42' }) },
    )
    expect(detailResponse.status).toBe(200)
    expect(routeState.getAccessReviewRun).toHaveBeenCalledWith(
      { db: true },
      42,
      expect.anything(),
    )
  })

  it('validates access-review detail params before authentication', async () => {
    const { GET } = await import('@/app/api/admin/access-reviews/[id]/route')
    const response = await GET(
      new Request('http://localhost/api/admin/access-reviews/nope') as never,
      { params: Promise.resolve({ id: 'nope' }) },
    )
    expect(response.status).toBe(400)
    expect(routeState.createRequestContext).not.toHaveBeenCalled()
  })

  it('sanitizes read-route dependency failures', async () => {
    const secret = 'token=read-route-secret'
    routeState.listAccessReviewRuns.mockRejectedValueOnce(new Error(secret))
    const { GET: list } = await import('@/app/api/admin/access-reviews/route')
    const listResponse = await list(
      new Request('http://localhost/api/admin/access-reviews') as never,
    )
    expect(listResponse.status).toBe(500)
    const listBody = await listResponse.json()
    expect(listBody).toEqual({ error: 'Failed to list access reviews' })
    expect(JSON.stringify(listBody)).not.toContain(secret)

    routeState.getAccessReviewRun.mockRejectedValueOnce(new Error(secret))
    const { GET: detail } = await import(
      '@/app/api/admin/access-reviews/[id]/route'
    )
    const detailResponse = await detail(
      new Request('http://localhost/api/admin/access-reviews/42') as never,
      { params: Promise.resolve({ id: '42' }) },
    )
    expect(detailResponse.status).toBe(500)
    const detailBody = await detailResponse.json()
    expect(detailBody).toEqual({ error: 'Failed to load access review' })
    expect(JSON.stringify(detailBody)).not.toContain(secret)
  })

  it('uses the incoming request for success audits when context omits it', async () => {
    const requestless = context()
    delete (requestless as { request?: Request }).request
    routeState.createRequestContext.mockResolvedValue(requestless)
    const cancel = (
      await import('@/app/api/admin/access-reviews/[id]/cancel/route')
    ).POST
    const complete = (
      await import('@/app/api/admin/access-reviews/[id]/complete/route')
    ).POST
    const exportReview = (
      await import('@/app/api/admin/access-reviews/[id]/export/route')
    ).POST
    const decide = (
      await import('@/app/api/admin/access-reviews/[id]/items/[itemId]/route')
    ).PATCH

    const requests = {
      cancel: jsonRequest(
        'http://localhost/api/admin/access-reviews/42/cancel',
        {},
      ),
      complete: jsonRequest(
        'http://localhost/api/admin/access-reviews/42/complete',
        {},
      ),
      decide: jsonRequest(
        'http://localhost/api/admin/access-reviews/42/items/7',
        { decision: 'approved' },
        'PATCH',
      ),
      export: jsonRequest(
        'http://localhost/api/admin/access-reviews/42/export',
        {
          delivery: 'json',
        },
      ),
    }
    const responses = await Promise.all([
      cancel(requests.cancel, { params: Promise.resolve({ id: '42' }) }),
      complete(requests.complete, { params: Promise.resolve({ id: '42' }) }),
      exportReview(requests.export, {
        params: Promise.resolve({ id: '42' }),
      }),
      decide(requests.decide, {
        params: Promise.resolve({ id: '42', itemId: '7' }),
      }),
    ])

    expect(responses.map(response => response.status)).toEqual([
      200, 200, 200, 200,
    ])
    expect(routeState.recordSecurityEvent).toHaveBeenCalledTimes(4)
    expect(
      routeState.recordSecurityEvent.mock.calls.map(([event]) => event.request),
    ).toEqual(expect.arrayContaining(Object.values(requests)))
  })

  it.each([
    [
      'cancel',
      'Failed to cancel access review',
      () =>
        routeState.cancelAccessReviewRun.mockRejectedValueOnce(
          new Error('token=mutation-secret'),
        ),
    ],
    [
      'complete',
      'Failed to complete access review',
      () =>
        routeState.completeAccessReviewRun.mockRejectedValueOnce(
          new Error('token=mutation-secret'),
        ),
    ],
    [
      'export',
      'Failed to export access review',
      () =>
        routeState.buildAccessReviewExport.mockRejectedValueOnce(
          new Error('token=mutation-secret'),
        ),
    ],
    [
      'item',
      'Failed to decide access review item',
      () =>
        routeState.decideAccessReviewItem.mockRejectedValueOnce(
          new Error('token=mutation-secret'),
        ),
    ],
  ] as const)(
    'sanitizes unexpected %s failures',
    async (operation, expectedError, fail) => {
      fail()
      let response: Response
      if (operation === 'cancel' || operation === 'complete') {
        const POST =
          operation === 'cancel'
            ? (await import('@/app/api/admin/access-reviews/[id]/cancel/route'))
                .POST
            : (
                await import(
                  '@/app/api/admin/access-reviews/[id]/complete/route'
                )
              ).POST
        response = await POST(
          jsonRequest(
            `http://localhost/api/admin/access-reviews/42/${operation}`,
            {},
          ),
          { params: Promise.resolve({ id: '42' }) },
        )
      } else if (operation === 'export') {
        const { POST } = await import(
          '@/app/api/admin/access-reviews/[id]/export/route'
        )
        response = await POST(
          jsonRequest('http://localhost/api/admin/access-reviews/42/export', {
            delivery: 'json',
          }),
          { params: Promise.resolve({ id: '42' }) },
        )
      } else {
        const { PATCH } = await import(
          '@/app/api/admin/access-reviews/[id]/items/[itemId]/route'
        )
        response = await PATCH(
          jsonRequest(
            'http://localhost/api/admin/access-reviews/42/items/7',
            { decision: 'approved' },
            'PATCH',
          ),
          { params: Promise.resolve({ id: '42', itemId: '7' }) },
        )
      }
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toEqual({ error: expectedError })
      expect(JSON.stringify(body)).not.toContain('token=mutation-secret')
    },
  )
})
