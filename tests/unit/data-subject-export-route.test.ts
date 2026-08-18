import { parse as parseContentDisposition } from 'content-disposition'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireGeneratedOutputCapacity,
  generatedOutputCapacitySnapshot,
} from '@/lib/generated-output/capacity'
import { GeneratedOutputError } from '@/lib/generated-output/errors'
import { validationError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  collectDataSubjectExport: vi.fn(),
  createRequestContext: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  getApplicationSettings: vi.fn(),
  getSessionFromRequest: vi.fn(),
  isSignedIn: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
  recordCapacityEvent: vi.fn(),
  recordSecurityEvent: vi.fn(),
  renderDataSubjectExportInWorker: vi.fn(),
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

vi.mock('@/lib/observability/capacity', () => ({
  recordCapacityEvent: routeState.recordCapacityEvent,
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

vi.mock('@/lib/pdf/report-worker', () => ({
  renderDataSubjectExportInWorker: routeState.renderDataSubjectExportInWorker,
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
    expect(generatedOutputCapacitySnapshot()).toMatchObject({
      activeCsv: 0,
      activePdf: 0,
    })
    vi.clearAllMocks()
    routeState.createRequestContext.mockResolvedValue(context())
    routeState.getSessionFromRequest.mockResolvedValue(signedSession())
    routeState.getApplicationSettings.mockResolvedValue({
      csvExportConcurrencyPerNode: 5,
      csvExportMaxFileBytes: 100 * 1024 * 1024,
      csvExportMaxItems: 1000,
      csvExportTimeoutSeconds: 120,
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxFileBytes: 50 * 1024 * 1024,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
      pdfWorkerMemoryMib: 512,
    })
    routeState.isSignedIn.mockReturnValue(true)
    routeState.renderDataSubjectExportInWorker.mockImplementation(
      async ({ outputPath }: { outputPath: string }) => {
        const { writeFile } = await import('node:fs/promises')
        await writeFile(outputPath, '%PDF')
        return 4
      },
    )
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
    expect(
      parseContentDisposition(response.headers.get('Content-Disposition') ?? '')
        .parameters.filename,
    ).toMatch(/\.json$/)
    expect(Number(response.headers.get('Content-Length'))).toBeGreaterThan(0)
    expect(response.headers.get('X-Accel-Buffering')).toBe('no')
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
      expect.objectContaining({ maxItems: 1000 }),
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.not.objectContaining({ targetHsaId: SELF_HSA_ID }),
        event: 'privacy.data_subject_export.generated',
      }),
    )
    const auditArg = routeState.recordSecurityEvent.mock.calls[0][0]
    expect(JSON.stringify(auditArg.detail)).not.toContain(SELF_HSA_ID)
    expect(routeState.recordCapacityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'privacy.data_subject_json_export',
        outcome: 'success',
      }),
    )
    expect(
      JSON.stringify(routeState.recordCapacityEvent.mock.calls),
    ).not.toContain(SELF_HSA_ID)
  })

  it('allows PrivacyOfficer to export another verified HSA-id', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxFileBytes: 50 * 1024 * 1024,
      pdfReportMaxRequirements: 2,
      pdfReportTimeoutSeconds: 180,
      pdfWorkerMemoryMib: 512,
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
    expect(routeState.renderDataSubjectExportInWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        exportData: expect.objectContaining({
          subject: { hsaId: OTHER_HSA_ID, targetFingerprint: 'fingerprint' },
        }),
        locale: 'en',
        maxBytes: expect.any(Number),
        memoryLimitMib: expect.any(Number),
      }),
    )
    expect(routeState.renderPdfResponse).not.toHaveBeenCalled()
    await response.arrayBuffer()
  })

  it('accepts a JSON privacy export at the exact configured item limit', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      csvExportConcurrencyPerNode: 5,
      csvExportMaxFileBytes: 100 * 1024 * 1024,
      csvExportMaxItems: 2,
      csvExportTimeoutSeconds: 120,
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
    })
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')

    const response = await POST(jsonPost({ delivery: 'json' }) as never)

    expect(response.status).toBe(200)
    expect(routeState.collectDataSubjectExport).toHaveBeenCalledWith(
      { db: true },
      expect.any(Object),
      expect.objectContaining({ maxItems: 2 }),
    )
    await response.arrayBuffer()
  })

  it('does not record PDF export success when rendering fails', async () => {
    routeState.renderDataSubjectExportInWorker.mockRejectedValueOnce(
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
    expect(routeState.renderDataSubjectExportInWorker).not.toHaveBeenCalled()
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('rejects an oversized PDF privacy export before rendering', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxFileBytes: 50 * 1024 * 1024,
      pdfReportMaxRequirements: 1,
      pdfReportTimeoutSeconds: 180,
      pdfWorkerMemoryMib: 512,
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
    expect(routeState.renderDataSubjectExportInWorker).not.toHaveBeenCalled()
  })

  it('rejects an oversized JSON privacy export with the JSON item contract', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      csvExportConcurrencyPerNode: 5,
      csvExportMaxFileBytes: 100 * 1024 * 1024,
      csvExportMaxItems: 1,
      csvExportTimeoutSeconds: 120,
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
    })
    routeState.collectDataSubjectExport.mockImplementationOnce(
      async (_db, _input, itemLimit) => {
        throw itemLimit.createItemLimitError(itemLimit.maxItems)
      },
    )
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')

    const response = await POST(jsonPost({ delivery: 'json' }) as never)

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 1, limitKind: 'items', output: 'json' },
    })
    expect(routeState.recordCapacityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metrics: expect.objectContaining({ item_count: 2, item_limit: 1 }),
      }),
    )
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('rejects a JSON export above the serialized byte limit without a partial artifact', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      csvExportConcurrencyPerNode: 5,
      csvExportMaxFileBytes: 1,
      csvExportMaxItems: 1000,
      csvExportTimeoutSeconds: 120,
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
    })
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')

    const response = await POST(jsonPost({ delivery: 'json' }) as never)

    expect(response.status).toBe(422)
    expect(response.headers.get('Content-Disposition')).toBeNull()
    expect(response.headers.get('Content-Length')).toBeNull()
    await expect(response.json()).resolves.toMatchObject({
      code: 'output_limit_exceeded',
      details: { limit: 1, limitKind: 'bytes', output: 'json' },
    })
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('returns the JSON timeout contract and releases generation capacity', async () => {
    vi.useFakeTimers()
    try {
      let markCollectionStarted: (() => void) | undefined
      const collectionStarted = new Promise<void>(resolve => {
        markCollectionStarted = resolve
      })
      routeState.getApplicationSettings.mockResolvedValueOnce({
        csvExportConcurrencyPerNode: 1,
        csvExportMaxFileBytes: 100 * 1024 * 1024,
        csvExportMaxItems: 1000,
        csvExportTimeoutSeconds: 10,
        pdfReportConcurrencyPerNode: 3,
        pdfReportMaxRequirements: 1000,
        pdfReportTimeoutSeconds: 180,
      })
      routeState.collectDataSubjectExport.mockImplementationOnce(
        async (_db, _input, itemLimit) => {
          markCollectionStarted?.()
          return new Promise((_resolve, reject) => {
            itemLimit.signal.addEventListener(
              'abort',
              () => reject(itemLimit.signal.reason),
              { once: true },
            )
          })
        },
      )
      const { POST } = await import(
        '@/app/api/privacy/data-subject-export/route'
      )

      const pendingResponse = POST(jsonPost({ delivery: 'json' }) as never)
      await collectionStarted
      await vi.advanceTimersByTimeAsync(10_000)
      const response = await pendingResponse

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({
        code: 'generation_timeout',
        details: { output: 'json', timeoutSeconds: 10 },
      })
      expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops a cancelled JSON export after collection without an artifact', async () => {
    const controller = new AbortController()
    routeState.collectDataSubjectExport.mockImplementationOnce((_db, input) => {
      controller.abort()
      return Promise.resolve(exportPayload(input.target.hsaId))
    })
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')

    const response = await POST(
      jsonPost({ delivery: 'json' }, controller.signal) as never,
    )

    expect(response.status).toBe(499)
    expect(response.headers.get('Content-Disposition')).toBeNull()
    expect(response.headers.get('Content-Length')).toBeNull()
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
    expect(generatedOutputCapacitySnapshot().activeCsv).toBe(0)
  })

  it('acquires JSON capacity before collection and returns the stable busy response', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      csvExportConcurrencyPerNode: 1,
      csvExportMaxFileBytes: 100 * 1024 * 1024,
      csvExportMaxItems: 1000,
      csvExportTimeoutSeconds: 120,
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
    })
    const occupied = acquireGeneratedOutputCapacity({
      concurrencyLimit: 1,
      output: 'csv',
    })
    try {
      const { POST } = await import(
        '@/app/api/privacy/data-subject-export/route'
      )
      const response = await POST(jsonPost({ delivery: 'json' }) as never)

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('5')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      await expect(response.json()).resolves.toMatchObject({
        code: 'capacity_busy',
        details: { output: 'json', retryAfterSeconds: 5 },
      })
      expect(routeState.collectDataSubjectExport).not.toHaveBeenCalled()
    } finally {
      occupied.release()
    }
    expect(generatedOutputCapacitySnapshot().activeCsv).toBe(0)
  })

  it.each([
    [
      new GeneratedOutputError('output_limit_exceeded', 'byte_limit_exceeded', {
        limit: 1024,
        limitKind: 'bytes',
        output: 'pdf',
      }),
      422,
      'output_limit_exceeded',
    ],
    [
      new GeneratedOutputError(
        'pdf_worker_memory_exceeded',
        'worker_memory_exceeded',
        { output: 'pdf' },
      ),
      503,
      'pdf_worker_memory_exceeded',
    ],
  ])(
    'returns a stable privacy PDF worker failure without partial headers',
    async (error, status, code) => {
      routeState.renderDataSubjectExportInWorker.mockRejectedValueOnce(error)
      const { POST } = await import(
        '@/app/api/privacy/data-subject-export/route'
      )

      const response = await POST(jsonPost({ delivery: 'pdf' }) as never)

      expect(response.status).toBe(status)
      expect(response.headers.get('Content-Disposition')).toBeNull()
      expect(response.headers.get('Content-Length')).toBeNull()
      await expect(response.json()).resolves.toMatchObject({ code })
      expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
      expect(generatedOutputCapacitySnapshot().activePdf).toBe(0)
    },
  )

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
      expect.objectContaining({ maxItems: 1000 }),
    )
  })

  it('deduplicates repeated identity-provider roles in the bounded export model', async () => {
    routeState.createRequestContext.mockResolvedValueOnce(
      context(['Reviewer', 'Reviewer']),
    )
    routeState.getSessionFromRequest.mockResolvedValueOnce({
      ...signedSession(),
      roles: ['Reviewer', 'Reviewer'],
    })
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')

    const response = await POST(jsonPost({ delivery: 'json' }) as never)
    await response.arrayBuffer()

    expect(routeState.collectDataSubjectExport).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        generatedBy: expect.objectContaining({ roles: ['Reviewer'] }),
        selfSession: expect.objectContaining({ roles: ['Reviewer'] }),
      }),
      expect.any(Object),
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
      expect.objectContaining({ maxItems: 1000 }),
    )
  })
})
