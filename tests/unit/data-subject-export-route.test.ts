import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validationError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  collectDataSubjectExport: vi.fn(),
  createRequestContext: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  getApplicationSettings: vi.fn(),
  getSessionFromRequest: vi.fn(),
  isSignedIn: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
  recordSecurityEvent: vi.fn(),
  renderPdfResponse: vi.fn((_document, _filename) =>
    Promise.resolve(
      new Response('%PDF', {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Disposition': 'attachment; filename="export.pdf"',
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
    recordDeniedActionAuditEvent: routeState.recordDeniedActionAuditEvent,
  }
})

vi.mock('@/lib/auth/session', () => ({
  getSessionFromRequest: routeState.getSessionFromRequest,
  isSignedIn: routeState.isSignedIn,
}))

vi.mock('@/lib/http/safe-errors', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/http/safe-errors')>()
  return {
    ...actual,
    logSanitizedError: vi.fn(),
  }
})

vi.mock('@/lib/privacy/data-subject-export', () => ({
  collectDataSubjectExport: routeState.collectDataSubjectExport,
}))

vi.mock('@/components/privacy/DataSubjectExportPdfRenderer', () => ({
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

const SELF_HSA_ID = 'SE5560000001-self1'
const OTHER_HSA_ID = 'SE5560000001-other1'

function context(roles: string[] = []) {
  return {
    actor: {
      displayName: 'Self User',
      hsaId: SELF_HSA_ID,
      id: 'self-sub',
      isAuthenticated: true,
      roles,
      source: 'oidc',
    },
    correlationId: 'correlation-1',
    request: new Request('http://localhost/api/privacy/data-subject-export'),
    requestId: 'request-1',
    source: 'rest',
  }
}

function signedSession() {
  return {
    accessTokenExpiresAt: 1_777_777_777,
    email: 'self@example.test',
    familyName: 'User',
    givenName: 'Self',
    hsaId: SELF_HSA_ID,
    name: 'Self User',
    roles: ['Reviewer'],
    sub: 'self-sub',
  }
}

function jsonPost(body: unknown, signal?: AbortSignal): Request {
  return new Request('http://localhost/api/privacy/data-subject-export', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  })
}

function exportPayload(hsaId: string) {
  return {
    generatedAt: '2026-05-12T12:00:00.000Z',
    generatedBy: {
      displayName: 'Self User',
      hsaId: SELF_HSA_ID,
      roles: ['PrivacyOfficer'],
      source: 'oidc',
      sub: 'self-sub',
    },
    limitations: [],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [],
    subject: {
      hsaId,
      targetFingerprint: 'fingerprint',
    },
    summary: {
      itemCount: 2,
      limitationCount: 0,
      sourceCount: 1,
    },
  }
}

describe('data-subject export route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequestContext.mockResolvedValue(context())
    routeState.getSessionFromRequest.mockResolvedValue(signedSession())
    routeState.getApplicationSettings.mockResolvedValue({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
    })
    routeState.isSignedIn.mockReturnValue(true)
    routeState.renderPdfResponse.mockClear()
    routeState.collectDataSubjectExport.mockImplementation((_db, input) =>
      Promise.resolve(exportPayload(input.target.hsaId)),
    )
  })

  it('exports the signed-in user without a target body', async () => {
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')
    const response = await POST(jsonPost({ delivery: 'json' }) as never)
    const body = (await response.json()) as ReturnType<typeof exportPayload>

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body.subject.hsaId).toBe(SELF_HSA_ID)
    expect(routeState.collectDataSubjectExport).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        selfSession: expect.objectContaining({
          hsaId: SELF_HSA_ID,
          sub: 'self-sub',
        }),
        target: { hsaId: SELF_HSA_ID },
      }),
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.not.objectContaining({ targetHsaId: SELF_HSA_ID }),
        event: 'privacy.data_subject_export.generated',
      }),
    )
    const auditArg = routeState.recordSecurityEvent.mock.calls[0][0]
    expect(JSON.stringify(auditArg.detail)).not.toContain(SELF_HSA_ID)
  })

  it('allows PrivacyOfficer to export another verified HSA-id', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 2,
      pdfReportTimeoutSeconds: 180,
    })
    routeState.createRequestContext.mockResolvedValueOnce(
      context(['PrivacyOfficer']),
    )
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')
    const response = await POST(
      jsonPost({
        delivery: 'pdf',
        locale: 'en',
        target: { hsaId: OTHER_HSA_ID },
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(routeState.collectDataSubjectExport).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        selfSession: null,
        target: { hsaId: OTHER_HSA_ID },
      }),
      expect.objectContaining({ maxItems: 2 }),
    )
    expect(routeState.renderPdfResponse).toHaveBeenCalledWith(
      expect.any(Object),
      'data-subject-access-export-fingerprint-2026-05-12.pdf',
      { capacity: expect.objectContaining({ output: 'pdf' }) },
    )
    expect(routeState.renderPdfResponse.mock.calls[0][0].props.locale).toBe(
      'en',
    )
  })

  it('does not record PDF export success when rendering fails', async () => {
    routeState.renderPdfResponse.mockRejectedValueOnce(
      new Error('PDF render failed'),
    )
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')

    const response = await POST(jsonPost({ delivery: 'pdf' }) as never)

    expect(response.status).toBe(500)
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('stops a cancelled PDF export after collection and before rendering', async () => {
    const controller = new AbortController()
    routeState.collectDataSubjectExport.mockImplementationOnce((_db, input) => {
      controller.abort()
      return Promise.resolve(exportPayload(input.target.hsaId))
    })
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')

    const response = await POST(
      jsonPost({ delivery: 'pdf' }, controller.signal) as never,
    )

    expect(response.status).toBe(499)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.renderPdfResponse).not.toHaveBeenCalled()
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('rejects an oversized PDF privacy export before rendering', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1,
      pdfReportTimeoutSeconds: 180,
    })
    routeState.collectDataSubjectExport.mockImplementationOnce(
      async (_db, _input, itemLimit) => {
        throw itemLimit.createItemLimitError(itemLimit.maxItems)
      },
    )
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')

    const response = await POST(
      jsonPost({ delivery: 'pdf', locale: 'sv' }) as never,
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.renderPdfResponse).not.toHaveBeenCalled()
  })

  it('rejects cross-user export without PrivacyOfficer', async () => {
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')
    const response = await POST(
      jsonPost({
        delivery: 'json',
        target: { hsaId: OTHER_HSA_ID },
      }) as never,
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.collectDataSubjectExport).not.toHaveBeenCalled()
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
    expect(routeState.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({ requestId: 'request-1' }),
      expect.objectContaining({ action: 'privacy.data_subject_export.denied' }),
    )
  })

  it('rejects invalid target HSA-id before opening the database', async () => {
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')
    const response = await POST(
      jsonPost({
        delivery: 'json',
        target: { hsaId: 'not-a-hsa-id' },
      }) as never,
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.collectDataSubjectExport).not.toHaveBeenCalled()
  })

  it('prevents caching unexpected export failures', async () => {
    routeState.collectDataSubjectExport.mockRejectedValueOnce(
      new Error('Export failed'),
    )
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')
    const response = await POST(jsonPost({ delivery: 'json' }) as never)

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('exports with minimal session claims and the incoming request audit fallback', async () => {
    const minimalContext = context()
    delete (minimalContext as { request?: Request }).request
    delete (minimalContext.actor as { id?: string }).id
    routeState.createRequestContext.mockResolvedValueOnce(minimalContext)
    routeState.getSessionFromRequest.mockResolvedValueOnce({
      ...signedSession(),
      email: undefined,
    })
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')
    const response = await POST(jsonPost({ delivery: 'json' }) as never)

    expect(response.status).toBe(200)
    expect(routeState.collectDataSubjectExport).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        generatedBy: expect.not.objectContaining({ sub: expect.anything() }),
        selfSession: expect.not.objectContaining({ email: expect.anything() }),
      }),
    )
  })

  it('omits session claims when the session is not signed in and maps expected failures', async () => {
    routeState.isSignedIn.mockReturnValueOnce(false)
    routeState.collectDataSubjectExport.mockRejectedValueOnce(
      validationError('Export unavailable', { reason: 'export_unavailable' }),
    )
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')
    const response = await POST(jsonPost({ delivery: 'json' }) as never)

    expect(response.status).toBe(400)
    expect(routeState.collectDataSubjectExport).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({ selfSession: null }),
    )
  })
})
