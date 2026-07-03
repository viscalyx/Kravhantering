import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
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
  patchAiGenerationSettings: vi.fn(),
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
  patchAiGenerationSettings: routeState.patchAiGenerationSettings,
  updateAiGenerationSettings: routeState.updateAiGenerationSettings,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService: () => ({
    assertAuthorized: vi.fn(),
  }),
  createRequestContext: routeState.createRequestContext,
}))

import { GET, PATCH, PUT } from '@/app/api/admin/ai-settings/route'

const enabledResponse = {
  aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
  disabledByEnvironment: false,
  effectiveRequirementGenerationEnabled: true,
  mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
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
          aiSafetyRuleCacheTtlSeconds: values.aiSafetyRuleCacheTtlSeconds,
          disabledByEnvironment: true,
          effectiveRequirementGenerationEnabled: false,
          mcpMaxRequestBytes: values.mcpMaxRequestBytes,
          requirementGenerationEnabled: values.requirementGenerationEnabled,
        }
      },
    )
    routeState.patchAiGenerationSettings.mockImplementation(
      async (_db, values, options) => {
        await options?.audit?.({ query: vi.fn() })
        return {
          ...enabledResponse,
          ...values,
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

  it('rejects invalid MCP request payload limits before saving', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/ai-settings', {
        body: JSON.stringify({
          aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
          mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES + 1,
          requirementGenerationEnabled: false,
        }),
        method: 'PUT',
      }),
    )

    expect(response.status).toBe(400)
    expect(routeState.updateAiGenerationSettings).not.toHaveBeenCalled()
  })

  it('saves the preference and records privileged audit', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/ai-settings', {
        body: JSON.stringify({
          aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
          mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
          requirementGenerationEnabled: false,
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as typeof enabledResponse

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body).toEqual({
      aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
      disabledByEnvironment: true,
      effectiveRequirementGenerationEnabled: false,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: false,
    })
    expect(routeState.updateAiGenerationSettings).toHaveBeenCalledWith(
      { db: true },
      {
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        requirementGenerationEnabled: false,
      },
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-ai' }),
      {
        changedFields: [
          'requirementGenerationEnabled',
          'mcpMaxRequestBytes',
          'aiSafetyRuleCacheTtlSeconds',
        ],
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
        body: JSON.stringify({
          aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
          mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
          requirementGenerationEnabled: false,
        }),
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

  it('patches one AI setting and records privileged audit', async () => {
    const response = await PATCH(
      new NextRequest('https://example.test/api/admin/ai-settings', {
        body: JSON.stringify({ aiSafetyRuleCacheTtlSeconds: 300 }),
        method: 'PATCH',
      }),
    )
    const body = (await response.json()) as typeof enabledResponse

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body.aiSafetyRuleCacheTtlSeconds).toBe(300)
    expect(routeState.patchAiGenerationSettings).toHaveBeenCalledWith(
      { db: true },
      { aiSafetyRuleCacheTtlSeconds: 300 },
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-ai' }),
      {
        changedFields: ['aiSafetyRuleCacheTtlSeconds'],
        operation: 'update',
        resourceId: 'global',
        resourceType: 'ai_settings',
      },
      expect.anything(),
    )
  })
})
