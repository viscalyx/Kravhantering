import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createArchivingRetentionException: vi.fn(),
  deleteArchivingRetentionException: vi.fn(),
  createRequestContext: vi.fn(),
  db: {
    db: true,
    transaction: vi.fn(
      async (
        callback: (manager: {
          db: boolean
          query: ReturnType<typeof vi.fn>
        }) => Promise<unknown>,
      ) => callback({ db: true, query: vi.fn() }),
    ),
  },
  executeArchivingRetention: vi.fn(),
  exportArchivingRetentionArchive: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  listArchivingRetentionPolicies: vi.fn(),
  previewArchivingRetention: vi.fn(),
  recordAllowedActionAuditEvent: vi.fn(),
  recordAllowedActionAuditEventWithExecutor: vi.fn(),
  recordSecurityEvent: vi.fn(),
  requireHumanActorSnapshot: vi.fn(() => ({
    displayName: 'Disa PrivacyOfficer',
    hsaId: 'SE5560000001-privacy1',
  })),
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
    recordAllowedActionAuditEventWithExecutor:
      routeState.recordAllowedActionAuditEventWithExecutor,
  }
})

vi.mock('@/lib/audit/requirement-selection-cleanup-audit', () => ({
  recordRequirementSelectionCleanupAudit: vi.fn(),
}))

vi.mock('@/lib/archiving/retention', () => ({
  createArchivingRetentionException:
    routeState.createArchivingRetentionException,
  deleteArchivingRetentionException:
    routeState.deleteArchivingRetentionException,
  executeArchivingRetention: routeState.executeArchivingRetention,
  exportArchivingRetentionArchive: routeState.exportArchivingRetentionArchive,
  listArchivingRetentionPolicies: routeState.listArchivingRetentionPolicies,
  previewArchivingRetention: routeState.previewArchivingRetention,
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

function privacyContext(roles: string[] = ['PrivacyOfficer']) {
  return {
    actor: {
      displayName: 'Disa PrivacyOfficer',
      hsaId: 'SE5560000001-privacy1',
      id: 'privacy-sub',
      isAuthenticated: true,
      roles,
      source: 'session',
    },
    correlationId: 'correlation-1',
    request: new Request('http://localhost/api/admin/archiving/preview'),
    requestId: 'request-1',
    source: 'rest',
  }
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
}

const preview = {
  candidates: [],
  cutoff: '2025-05-14T00:00:00.000Z',
  policy: {
    policyKey: 'unused_taxonomy_delete',
  },
  previewToken: 'token',
  summary: {
    archiveCount: 0,
    candidateCount: 1,
    deleteCount: 1,
    exceptionCount: 0,
    skippedCount: 0,
  },
}

describe('archiving retention routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequestContext.mockResolvedValue(privacyContext())
    routeState.getRequestSqlServerDataSource.mockResolvedValue(routeState.db)
    routeState.listArchivingRetentionPolicies.mockResolvedValue([{ id: 3 }])
    routeState.previewArchivingRetention.mockResolvedValue(preview)
    routeState.executeArchivingRetention.mockResolvedValue({
      ...preview,
      runId: 9,
      runRequestId: 'run-request',
    })
    routeState.exportArchivingRetentionArchive.mockResolvedValue({
      archive: { schemaVersion: 'archiving-retention-export.v2' },
      exportToken: 'export-token',
    })
    routeState.createArchivingRetentionException.mockResolvedValue({
      id: 3,
      policyId: 3,
      sourceKey: 'requirement_areas.unused',
      subjectTable: 'requirement_areas',
    })
    routeState.deleteArchivingRetentionException.mockResolvedValue(true)
  })

  it('lists retention policies for PrivacyOfficer with no-store', async () => {
    const { GET } = await import('@/app/api/admin/archiving/policies/route')
    const response = await GET(
      new Request('http://localhost/api/admin/archiving/policies') as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ policies: [{ id: 3 }] })
  })

  it('previews retention and audits counts without raw subject values', async () => {
    const { POST } = await import('@/app/api/admin/archiving/preview/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/archiving/preview', {
        policyId: 3,
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.previewArchivingRetention).toHaveBeenCalledWith(
      expect.objectContaining({ db: true }),
      { policyId: 3 },
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          candidateCount: 1,
          policyKey: 'unused_taxonomy_delete',
        }),
        event: 'admin.archiving.previewed',
      }),
    )
    expect(
      JSON.stringify(routeState.recordSecurityEvent.mock.calls[0][0].detail),
    ).not.toContain('SE5560000001')
  })

  it('rejects retention preview without PrivacyOfficer', async () => {
    routeState.createRequestContext.mockResolvedValueOnce(privacyContext([]))
    const { POST } = await import('@/app/api/admin/archiving/preview/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/archiving/preview', {
        policyId: 3,
      }) as never,
    )

    expect(response.status).toBe(403)
    expect(routeState.previewArchivingRetention).not.toHaveBeenCalled()
  })

  it('executes retention and records redacted audit detail', async () => {
    const { POST } = await import('@/app/api/admin/archiving/runs/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/archiving/runs', {
        exportToken: 'export-token',
        policyId: 3,
        previewToken: 'token',
      }) as never,
    )

    expect(response.status).toBe(201)
    expect(routeState.executeArchivingRetention).toHaveBeenCalledWith(
      expect.objectContaining({ db: true }),
      expect.objectContaining({
        exportToken: 'export-token',
        policyId: 3,
        previewToken: 'token',
      }),
      { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.archiving.executed',
      }),
    )
  })

  it('exports archive JSON with no-store', async () => {
    const { POST } = await import('@/app/api/admin/archiving/exports/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/archiving/exports', {
        policyId: 3,
        previewToken: 'token',
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.exportArchivingRetentionArchive).toHaveBeenCalledWith(
      expect.objectContaining({ db: true }),
      { policyId: 3, previewToken: 'token' },
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.archiving.exported',
      }),
    )
  })

  it('creates retention exceptions with no-store and redacted audit detail', async () => {
    const { POST } = await import('@/app/api/admin/archiving/exceptions/route')
    const payload = {
      policyId: 3,
      reason: 'Legal hold for case 2026-05',
      sourceKey: 'owners.identity',
      subjectId: 'SE5560000001-kalle1',
      subjectTable: 'owners',
    }
    routeState.createArchivingRetentionException.mockResolvedValueOnce({
      id: 4,
      policyId: payload.policyId,
      sourceKey: payload.sourceKey,
      subjectTable: payload.subjectTable,
    })
    const response = await POST(
      jsonRequest(
        'http://localhost/api/admin/archiving/exceptions',
        payload,
      ) as never,
    )

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.createArchivingRetentionException).toHaveBeenCalledWith(
      expect.objectContaining({ db: true }),
      {
        ...payload,
        expiresAt: null,
      },
      { displayName: 'Disa PrivacyOfficer', hsaId: 'SE5560000001-privacy1' },
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          policyId: 3,
          sourceKey: 'owners.identity',
          subjectTable: 'owners',
        }),
        event: 'admin.archiving.exception.created',
      }),
    )
    expect(
      JSON.stringify(routeState.recordSecurityEvent.mock.calls[0][0].detail),
    ).not.toContain('SE5560000001-kalle1')
  })

  it('rejects retention exceptions without PrivacyOfficer', async () => {
    routeState.createRequestContext.mockResolvedValueOnce(privacyContext([]))
    const { POST } = await import('@/app/api/admin/archiving/exceptions/route')
    const response = await POST(
      jsonRequest('http://localhost/api/admin/archiving/exceptions', {
        policyId: 3,
        reason: 'Legal hold for case 2026-05',
        sourceKey: 'owners.identity',
        subjectId: 'SE5560000001-kalle1',
        subjectTable: 'owners',
      }) as never,
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.createArchivingRetentionException).not.toHaveBeenCalled()
  })
})
