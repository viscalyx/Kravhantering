import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequirementsServiceError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  createAdminPrivilegedAuditContext: vi.fn(async () => ({
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-ai',
    request: {
      method: 'PUT',
      path: '/api/admin/ai-settings',
      requestId: 'request-ai',
    },
    requestId: 'request-ai',
    source: 'rest',
  })),
  createRequestContext: vi.fn(async () => ({
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-ai',
    request: {
      method: 'GET',
      path: '/api/admin/ai-settings',
      requestId: 'request-ai',
    },
    requestId: 'request-ai',
    source: 'rest',
  })),
  getAiGenerationAvailability: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
  updateAiGenerationSettings: vi.fn(),
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext:
    routeState.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    routeState.recordAdminPrivilegedActionSucceeded,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/ai-settings', () => ({
  formatAiSettingsLoadError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  getAiGenerationAvailability: routeState.getAiGenerationAvailability,
  updateAiGenerationSettings: routeState.updateAiGenerationSettings,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService: () => ({
    assertAuthorized: vi.fn(),
  }),
  createRequestContext: routeState.createRequestContext,
}))

import { GET, PUT } from '@/app/api/admin/ai-settings/route'

const enabledResponse = {
  disabledByEnvironment: false,
  effectiveRequirementGenerationEnabled: true,
  requirementGenerationEnabled: true,
}

describe('admin AI settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.getAiGenerationAvailability.mockResolvedValue(enabledResponse)
    routeState.updateAiGenerationSettings.mockImplementation(
      async (_db, values, options) => {
        await options?.audit?.({ query: vi.fn() })
        return {
          disabledByEnvironment: true,
          effectiveRequirementGenerationEnabled: false,
          requirementGenerationEnabled: values.requirementGenerationEnabled,
        }
      },
    )
  })

  it('returns AI settings for Admin users', async () => {
    const response = await GET(
      new NextRequest('https://example.test/api/admin/ai-settings'),
    )

    await expect(response.json()).resolves.toEqual(enabledResponse)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.getAiGenerationAvailability).toHaveBeenCalledWith({
      db: true,
    })
  })

  it('rejects non-Admin GET callers', async () => {
    routeState.createRequestContext.mockResolvedValueOnce({
      actor: {
        displayName: 'Reviewer',
        hsaId: 'SE5560000001-reviewer1',
        id: 'reviewer-sub',
        isAuthenticated: true,
        roles: ['Reviewer'],
        source: 'oidc',
      },
      correlationId: 'correlation-ai',
      request: {
        method: 'GET',
        path: '/api/admin/ai-settings',
        requestId: 'request-ai',
      },
      requestId: 'request-ai',
      source: 'rest',
    })

    const response = await GET(
      new NextRequest('https://example.test/api/admin/ai-settings'),
    )
    const body = (await response.json()) as { error?: string }

    expect(response.status).toBe(403)
    expect(body.error).toBe('Forbidden')
    expect(routeState.getAiGenerationAvailability).not.toHaveBeenCalled()
  })

  it('validates PUT payloads before saving', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/ai-settings', {
        body: JSON.stringify({ requirementGenerationEnabled: 'false' }),
        method: 'PUT',
      }),
    )

    expect(response.status).toBe(400)
    expect(routeState.updateAiGenerationSettings).not.toHaveBeenCalled()
  })

  it('saves the preference and records privileged audit', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/ai-settings', {
        body: JSON.stringify({ requirementGenerationEnabled: false }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as typeof enabledResponse

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toEqual({
      disabledByEnvironment: true,
      effectiveRequirementGenerationEnabled: false,
      requirementGenerationEnabled: false,
    })
    expect(routeState.updateAiGenerationSettings).toHaveBeenCalledWith(
      { db: true },
      { requirementGenerationEnabled: false },
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-ai' }),
      {
        changedFields: ['requirementGenerationEnabled'],
        operation: 'save',
        resourceId: 'global',
        resourceType: 'ai_settings',
      },
      expect.anything(),
    )
  })

  it('maps service errors from PUT saves to HTTP error responses', async () => {
    routeState.updateAiGenerationSettings.mockRejectedValueOnce(
      new RequirementsServiceError('validation', 'Invalid AI settings', {
        httpStatus: 422,
      }),
    )

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/ai-settings', {
        body: JSON.stringify({ requirementGenerationEnabled: false }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { code?: string; error?: string }

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toEqual({
      code: 'validation',
      error: 'Invalid AI settings',
    })
  })
})
