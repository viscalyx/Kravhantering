import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CsrfError } from '@/lib/auth/csrf'
import { conflictError, validationError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  createRequestContext: vi.fn(),
  executePrivacyErasure: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  previewPrivacyErasure: vi.fn(),
  recordSecurityEvent: vi.fn(),
  requireHumanActorSnapshot: vi.fn(() => ({
    displayName: 'Disa PrivacyOfficer',
    hsaId: 'SE2321000032-privacy1',
  })),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/auth/audit', () => ({
  recordSecurityEvent: routeState.recordSecurityEvent,
}))

vi.mock('@/lib/http/safe-errors', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/http/safe-errors')>()
  return {
    ...actual,
    logSanitizedError: vi.fn(),
  }
})

vi.mock('@/lib/privacy/erasure', () => ({
  executePrivacyErasure: routeState.executePrivacyErasure,
  previewPrivacyErasure: routeState.previewPrivacyErasure,
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
      hsaId: 'SE2321000032-privacy1',
      id: 'privacy-sub',
      isAuthenticated: true,
      roles,
      source: 'session',
    },
    correlationId: 'correlation-1',
    request: new Request('http://localhost/api/privacy/erasure-preview'),
    requestId: 'request-1',
    source: 'rest',
  }
}

function jsonPost(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
    method: 'POST',
  })
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe('privacy erasure routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequestContext.mockResolvedValue(privacyContext())
    routeState.previewPrivacyErasure.mockResolvedValue({
      groups: [],
      previewToken: 'preview-token',
      targetFingerprint: 'fingerprint',
      totalCount: 0,
    })
    routeState.executePrivacyErasure.mockResolvedValue({
      actions: { anonymize: 1, delete: 0, skip: 0, switch: 0 },
      groups: [],
      requestId: 'erasure-request-1',
      targetFingerprint: 'fingerprint',
      totalCount: 1,
    })
  })

  it('previews erasure for PrivacyOfficer and redacts target identity from audit detail', async () => {
    const { POST } = await import('@/app/api/privacy/erasure-preview/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-preview', {
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(routeState.previewPrivacyErasure).toHaveBeenCalledWith(
      { db: true },
      {
        replacement: null,
        target: { hsaId: 'SE2321000032-kalle1' },
      },
    )
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.not.objectContaining({
          targetHsaId: 'SE2321000032-kalle1',
        }),
        event: 'privacy.erasure.previewed',
      }),
    )
    const auditArg = routeState.recordSecurityEvent.mock.calls[0][0]
    expect(JSON.stringify(auditArg.detail)).not.toContain('SE2321000032-kalle1')
  })

  it('rejects erasure preview when CSRF validation fails before previewing', async () => {
    routeState.createRequestContext.mockRejectedValueOnce(
      new CsrfError('Missing X-Requested-With header.'),
    )
    const { POST } = await import('@/app/api/privacy/erasure-preview/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-preview', {
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )

    expect(response.status).toBe(403)
    expect(routeState.previewPrivacyErasure).not.toHaveBeenCalled()
  })

  it('accepts erasure preview when the request context passes CSRF validation', async () => {
    const { POST } = await import('@/app/api/privacy/erasure-preview/route')
    const response = await POST(
      jsonPost(
        'http://localhost/api/privacy/erasure-preview',
        { target: { hsaId: 'SE2321000032-kalle1' } },
        {
          Origin: 'http://localhost',
          'X-Requested-With': 'XMLHttpRequest',
        },
      ) as never,
    )

    expect(response.status).toBe(200)
    expect(routeState.previewPrivacyErasure).toHaveBeenCalledTimes(1)
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'privacy.erasure.previewed' }),
    )
  })

  it('accepts a replacement HSA-ID and display name that are not seeded', async () => {
    const { POST } = await import('@/app/api/privacy/erasure-preview/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-preview', {
        replacement: {
          displayName: 'John Levi',
          email: 'john.levi@example.com',
          firstName: 'John Carl',
          hsaId: 'SE2321000032-johlju',
          lastName: 'Levi',
        },
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(routeState.previewPrivacyErasure).toHaveBeenCalledWith(
      { db: true },
      {
        replacement: {
          displayName: 'John Levi',
          email: 'john.levi@example.com',
          firstName: 'John Carl',
          hsaId: 'SE2321000032-johlju',
          lastName: 'Levi',
        },
        target: { hsaId: 'SE2321000032-kalle1' },
      },
    )
  })

  it('rejects preview without PrivacyOfficer', async () => {
    routeState.createRequestContext.mockResolvedValueOnce(privacyContext([]))
    const { POST } = await import('@/app/api/privacy/erasure-preview/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-preview', {
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )

    expect(response.status).toBe(403)
    expect(routeState.previewPrivacyErasure).not.toHaveBeenCalled()
  })

  it('rejects name-only preview requests before opening the database', async () => {
    const { POST } = await import('@/app/api/privacy/erasure-preview/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-preview', {
        target: { name: 'Kalle Svensson' },
      }) as never,
    )
    const body = (await response.json()) as {
      error: string
      issues: Array<{ path: string }>
    }

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'target.hsaId' }),
      ]),
    )
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('returns conflict when execution detects a stale preview', async () => {
    routeState.executePrivacyErasure.mockRejectedValueOnce(
      conflictError('Privacy erasure preview is stale', {
        reason: 'stale_privacy_preview',
      }),
    )
    const { POST } = await import('@/app/api/privacy/erasure-requests/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-requests', {
        previewToken: 'preview-token',
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )

    expect(response.status).toBe(409)
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('rejects erasure execution when CSRF validation fails before executing', async () => {
    routeState.createRequestContext.mockRejectedValueOnce(
      new CsrfError('Invalid X-Requested-With header.'),
    )
    const { POST } = await import('@/app/api/privacy/erasure-requests/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-requests', {
        previewToken: 'preview-token',
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )

    expect(response.status).toBe(403)
    expect(routeState.executePrivacyErasure).not.toHaveBeenCalled()
  })

  it('accepts erasure execution when the request context passes CSRF validation', async () => {
    const { POST } = await import('@/app/api/privacy/erasure-requests/route')
    const response = await POST(
      jsonPost(
        'http://localhost/api/privacy/erasure-requests',
        {
          previewToken: 'preview-token',
          target: { hsaId: 'SE2321000032-kalle1' },
        },
        {
          Origin: 'http://localhost',
          'X-Requested-With': 'XMLHttpRequest',
        },
      ) as never,
    )

    expect(response.status).toBe(201)
    expect(routeState.executePrivacyErasure).toHaveBeenCalledTimes(1)
    expect(routeState.recordSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'privacy.erasure.executed' }),
    )
  })

  it('rejects execution without PrivacyOfficer', async () => {
    routeState.createRequestContext.mockResolvedValueOnce(privacyContext([]))
    const { POST } = await import('@/app/api/privacy/erasure-requests/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-requests', {
        previewToken: 'preview-token',
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )

    expect(response.status).toBe(403)
    expect(routeState.executePrivacyErasure).not.toHaveBeenCalled()
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('returns safe row details for privacy execution validation errors', async () => {
    routeState.executePrivacyErasure.mockRejectedValueOnce(
      validationError('Unsupported privacy erasure action', {
        action: 'delete',
        groupKey: 'owners.identity',
        reason: 'unsupported_privacy_action',
        targetHsaId: 'SE2321000032-kalle1',
      }),
    )
    const { POST } = await import('@/app/api/privacy/erasure-requests/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-requests', {
        actions: { 'owners.identity': 'delete' },
        previewToken: 'preview-token',
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )
    const body = await responseJson(response)

    expect(response.status).toBe(400)
    expect(body.details).toEqual({
      groupKey: 'owners.identity',
      reason: 'unsupported_privacy_action',
    })
    expect(JSON.stringify(body)).not.toContain('SE2321000032-kalle1')
    expect(routeState.recordSecurityEvent).not.toHaveBeenCalled()
  })

  it('omits privacy error details when no safe row key is available', async () => {
    routeState.executePrivacyErasure.mockRejectedValueOnce(
      validationError(
        'Replacement requires both a valid HSA-ID and display name',
        {
          reason: 'invalid_replacement',
          targetHsaId: 'SE2321000032-kalle1',
        },
      ),
    )
    const { POST } = await import('@/app/api/privacy/erasure-requests/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-requests', {
        previewToken: 'preview-token',
        replacement: {
          displayName: 'John Levi',
          hsaId: 'SE2321000032-johlju',
        },
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )
    const body = await responseJson(response)

    expect(response.status).toBe(400)
    expect(body).not.toHaveProperty('details')
    expect(JSON.stringify(body)).not.toContain('SE2321000032-kalle1')
  })

  it('sanitizes unexpected privacy execution failures', async () => {
    routeState.executePrivacyErasure.mockRejectedValueOnce(
      new Error('database failure for SE2321000032-kalle1'),
    )
    const { POST } = await import('@/app/api/privacy/erasure-requests/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-requests', {
        previewToken: 'preview-token',
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )
    const body = await responseJson(response)

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Failed to execute privacy erasure' })
    expect(JSON.stringify(body)).not.toContain('SE2321000032-kalle1')
  })

  it('includes sanitized development debug details for unexpected privacy execution failures', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    try {
      routeState.executePrivacyErasure.mockRejectedValueOnce(
        new Error(
          'SQL failed for SE2321000032-kalle1 while running SELECT token FROM owners',
        ),
      )
      const { POST } = await import('@/app/api/privacy/erasure-requests/route')
      const response = await POST(
        jsonPost('http://localhost/api/privacy/erasure-requests', {
          previewToken: 'preview-token',
          target: { hsaId: 'SE2321000032-kalle1' },
        }) as never,
      )
      const body = await responseJson(response)

      expect(response.status).toBe(500)
      expect(body.error).toBe('Failed to execute privacy erasure')
      expect(body.debugMessage).toContain('[HSA_ID_REDACTED]')
      expect(body.debugMessage).toContain('[SQL_REDACTED]')
      expect(JSON.stringify(body)).not.toContain('SE2321000032-kalle1')
      expect(JSON.stringify(body)).not.toContain('SELECT token FROM owners')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('executes erasure and audits counts without raw target HSA-ID', async () => {
    const { POST } = await import('@/app/api/privacy/erasure-requests/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-requests', {
        actions: { 'requirement_versions.created_by': 'anonymize' },
        previewToken: 'preview-token',
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )

    expect(response.status).toBe(201)
    expect(routeState.executePrivacyErasure).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        previewToken: 'preview-token',
        target: { hsaId: 'SE2321000032-kalle1' },
      }),
    )
    const auditArg = routeState.recordSecurityEvent.mock.calls[0][0]
    expect(auditArg).toEqual(
      expect.objectContaining({
        detail: expect.objectContaining({
          anonymizeCount: 1,
          erasureRequestId: 'erasure-request-1',
          targetFingerprint: 'fingerprint',
        }),
        event: 'privacy.erasure.executed',
      }),
    )
    expect(JSON.stringify(auditArg.detail)).not.toContain('SE2321000032-kalle1')
  })

  it('executes erasure with explicit replacement owner names', async () => {
    const { POST } = await import('@/app/api/privacy/erasure-requests/route')
    const response = await POST(
      jsonPost('http://localhost/api/privacy/erasure-requests', {
        actions: { 'requirement_packages.owner': 'switch' },
        previewToken: 'preview-token',
        replacement: {
          displayName: 'Anna Maria Eriksson',
          email: 'anna.maria.eriksson@example.com',
          firstName: 'Anna Maria',
          hsaId: 'SE2321000032-johlju',
          lastName: 'Eriksson',
        },
        target: { hsaId: 'SE2321000032-kalle1' },
      }) as never,
    )

    expect(response.status).toBe(201)
    expect(routeState.executePrivacyErasure).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        replacement: {
          displayName: 'Anna Maria Eriksson',
          email: 'anna.maria.eriksson@example.com',
          firstName: 'Anna Maria',
          hsaId: 'SE2321000032-johlju',
          lastName: 'Eriksson',
        },
      }),
    )
  })
})
