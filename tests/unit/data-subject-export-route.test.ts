import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  collectDataSubjectExport: vi.fn(),
  createRequestContext: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  getSessionFromRequest: vi.fn(),
  isSignedIn: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
  recordSecurityEvent: vi.fn(),
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

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createRequestContext: routeState.createRequestContext,
    requireHumanActorSnapshot: routeState.requireHumanActorSnapshot,
  }
})

const SELF_HSA_ID = 'SE2321000032-self1'
const OTHER_HSA_ID = 'SE2321000032-other1'

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

function jsonPost(body: unknown): Request {
  return new Request('http://localhost/api/privacy/data-subject-export', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
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
    routeState.isSignedIn.mockReturnValue(true)
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

  it('allows PrivacyOfficer to export another verified HSA-ID', async () => {
    routeState.createRequestContext.mockResolvedValueOnce(
      context(['PrivacyOfficer']),
    )
    const { POST } = await import('@/app/api/privacy/data-subject-export/route')
    const response = await POST(
      jsonPost({
        delivery: 'pdf',
        target: { hsaId: OTHER_HSA_ID },
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(routeState.collectDataSubjectExport).toHaveBeenCalledWith(
      { db: true },
      expect.objectContaining({
        selfSession: null,
        target: { hsaId: OTHER_HSA_ID },
      }),
    )
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

  it('rejects invalid target HSA-ID before opening the database', async () => {
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
})
