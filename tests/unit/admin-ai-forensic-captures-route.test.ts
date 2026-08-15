import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  context: {
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc' as const,
    },
    correlationId: 'capture-correlation',
    request: {
      method: 'POST',
      path: '/api/admin/ai-forensic-captures',
      requestId: 'capture-request',
    },
    requestId: 'capture-request',
    source: 'rest' as const,
  },
  createCaptureRequest: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ query: vi.fn() })),
  listCaptureMetadata: vi.fn(),
  readCaptureEvidence: vi.fn(),
  transitionCapture: vi.fn(),
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext: vi.fn(async () => routeState.context),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/ai/forensic-capture', async importOriginal => ({
  ...(await importOriginal()),
  createAiForensicCaptureRequest: routeState.createCaptureRequest,
  listAiForensicCaptureMetadata: routeState.listCaptureMetadata,
  readStoppedAiForensicCaptureEvidence: routeState.readCaptureEvidence,
  transitionAiForensicCapture: routeState.transitionCapture,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordDeniedActionAuditEvent: vi.fn(),
}))

vi.mock('@/lib/requirements/auth', async importOriginal => ({
  ...(await importOriginal()),
  createRequestContext: vi.fn(async () => routeState.context),
}))

import { GET, PATCH, POST } from '@/app/api/admin/ai-forensic-captures/route'

describe('admin AI forensic capture requests route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.context.actor = {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    }
    routeState.createCaptureRequest.mockResolvedValue({
      expiresAt: '2026-08-15T14:00:00.000Z',
      id: 47,
      status: 'pending_approval',
    })
    routeState.readCaptureEvidence.mockResolvedValue({
      capture: { id: 47, status: 'stopped' },
      events: [],
    })
    routeState.listCaptureMetadata.mockResolvedValue([])
  })

  it('lists metadata without returning evidence excerpts', async () => {
    const response = await GET(
      new NextRequest('https://example.test/api/admin/ai-forensic-captures'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      canPurge: false,
      captures: [],
    })
    expect(routeState.listCaptureMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      routeState.context,
    )
    expect(routeState.readCaptureEvidence).not.toHaveBeenCalled()
  })

  it('reads stopped evidence through the actor-bound service', async () => {
    const response = await GET(
      new NextRequest(
        'https://example.test/api/admin/ai-forensic-captures?captureWindowId=47',
      ),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(routeState.readCaptureEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      routeState.context,
      47,
    )
  })

  it('rejects malformed evidence read query parameters before database work', async () => {
    const response = await GET(
      new NextRequest(
        'https://example.test/api/admin/ai-forensic-captures?captureWindowId=invalid',
      ),
    )

    expect(response.status).toBe(400)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.listCaptureMetadata).not.toHaveBeenCalled()
    expect(routeState.readCaptureEvidence).not.toHaveBeenCalled()
  })

  it('maps actor-bound evidence authorization failures to the route contract', async () => {
    routeState.readCaptureEvidence.mockRejectedValue(
      forbiddenError('Forensic evidence is unavailable to this actor'),
    )

    const response = await GET(
      new NextRequest(
        'https://example.test/api/admin/ai-forensic-captures?captureWindowId=47',
      ),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Forbidden',
    })
  })

  it.each([
    ['Error', new Error('database unavailable')],
    ['NonError', 'database unavailable'],
  ])('redacts an unexpected %s evidence read failure', async (_, error) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    routeState.listCaptureMetadata.mockRejectedValue(error)

    const response = await GET(
      new NextRequest('https://example.test/api/admin/ai-forensic-captures'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to read AI forensic evidence.',
    })
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to read AI forensic evidence',
      { errorKind: error instanceof Error ? 'Error' : 'NonError' },
    )
  })

  it('lets an Admin request a capture with an explicit expiry', async () => {
    const response = await POST(
      new NextRequest('https://example.test/api/admin/ai-forensic-captures', {
        body: JSON.stringify({
          direction: 'output',
          expiresAt: '2026-08-15T14:00:00.000Z',
          operation: 'ai.generate-requirement-import',
        }),
        method: 'POST',
      }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      expiresAt: '2026-08-15T14:00:00.000Z',
      id: 47,
      status: 'pending_approval',
    })
    expect(routeState.createCaptureRequest).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      routeState.context,
      {
        direction: 'output',
        expiresAt: '2026-08-15T14:00:00.000Z',
        operation: 'ai.generate-requirement-import',
      },
    )
  })

  it('lets a Privacy Officer approve a request made by another actor', async () => {
    routeState.context.actor = {
      displayName: 'Disa Privacy Officer',
      hsaId: 'SE5560000001-privacy1',
      id: 'privacy-sub',
      isAuthenticated: true,
      roles: ['PrivacyOfficer'],
      source: 'oidc',
    }
    routeState.transitionCapture.mockResolvedValue({
      expiresAt: '2026-08-15T14:00:00.000Z',
      id: 47,
      status: 'active',
    })

    const response = await PATCH(
      new NextRequest('https://example.test/api/admin/ai-forensic-captures', {
        body: JSON.stringify({ action: 'approve', captureWindowId: 47 }),
        method: 'PATCH',
      }),
    )

    expect(response.status).toBe(200)
    expect(routeState.transitionCapture).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      routeState.context,
      { action: 'approve', captureWindowId: 47 },
    )
  })

  it('does not let an Admin approve a forensic capture request', async () => {
    const response = await PATCH(
      new NextRequest('https://example.test/api/admin/ai-forensic-captures', {
        body: JSON.stringify({ action: 'approve', captureWindowId: 47 }),
        method: 'PATCH',
      }),
    )

    expect(response.status).toBe(403)
    expect(routeState.transitionCapture).not.toHaveBeenCalled()
  })
})
