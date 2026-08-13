import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_AI_SETTINGS_CONSTRAINTS,
  AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
  MCP_IMPORT_MAX_ROWS_DEFAULT,
  MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
import { DEFAULT_APPLICATION_SETTINGS } from '@/lib/application-settings'
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
  clearAiSafetyRuntimeSettingsCache: vi.fn(),
  getAdminAiSettings: vi.fn(),
  getApplicationSettings: vi.fn(),
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
  clearAiSafetyRuntimeSettingsCache:
    routeState.clearAiSafetyRuntimeSettingsCache,
  formatAiSettingsLoadError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  getAdminAiSettings: routeState.getAdminAiSettings,
  patchAiGenerationSettings: routeState.patchAiGenerationSettings,
  updateAiGenerationSettings: routeState.updateAiGenerationSettings,
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: routeState.getApplicationSettings,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService: () => ({
    assertAuthorized: vi.fn(),
  }),
  createRequestContext: routeState.createRequestContext,
}))

import { GET, PATCH, PUT } from '@/app/api/admin/ai-settings/route'

const enabledResponse = {
  aiSafetyForensicLoggingEnabled: true,
  aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
  constraints: ADMIN_AI_SETTINGS_CONSTRAINTS,
  disabledByEnvironment: false,
  effectiveRequirementGenerationEnabled: true,
  mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
  mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
  mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
  requirementGenerationEnabled: true,
}

describe('admin AI settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.getAdminAiSettings.mockResolvedValue(enabledResponse)
    routeState.getApplicationSettings.mockResolvedValue(
      DEFAULT_APPLICATION_SETTINGS,
    )
    routeState.updateAiGenerationSettings.mockImplementation(
      async (_db, values, options) => {
        await options?.audit?.({ query: vi.fn() })
        return {
          aiSafetyRuleCacheTtlSeconds: values.aiSafetyRuleCacheTtlSeconds,
          aiSafetyForensicLoggingEnabled: values.aiSafetyForensicLoggingEnabled,
          constraints: ADMIN_AI_SETTINGS_CONSTRAINTS,
          disabledByEnvironment: true,
          effectiveRequirementGenerationEnabled: false,
          mcpImportMaxRows: values.mcpImportMaxRows,
          mcpImportValidationTtlMinutes: values.mcpImportValidationTtlMinutes,
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
    expect(routeState.getAdminAiSettings).toHaveBeenCalledWith({
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
    expect(routeState.getAdminAiSettings).not.toHaveBeenCalled()
  })

  it('returns a bounded no-store response for unexpected read failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    routeState.getAdminAiSettings.mockRejectedValueOnce(
      new Error('database unavailable'),
    )

    try {
      const response = await GET(
        new NextRequest('https://example.test/api/admin/ai-settings'),
      )

      await expect(response.json()).resolves.toEqual({
        error: 'Failed to load AI settings.',
      })
      expect(response.status).toBe(500)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to load admin AI settings',
        { message: 'database unavailable' },
      )
    } finally {
      errorSpy.mockRestore()
    }
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
          aiSafetyForensicLoggingEnabled: true,
          mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
          mcpImportValidationTtlMinutes:
            MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
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
          aiSafetyForensicLoggingEnabled: false,
          mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
          mcpImportValidationTtlMinutes:
            MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
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
      aiSafetyForensicLoggingEnabled: false,
      constraints: ADMIN_AI_SETTINGS_CONSTRAINTS,
      disabledByEnvironment: true,
      effectiveRequirementGenerationEnabled: false,
      mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
      mcpImportValidationTtlMinutes: MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
      mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
      requirementGenerationEnabled: false,
    })
    expect(routeState.updateAiGenerationSettings).toHaveBeenCalledWith(
      { db: true },
      {
        aiSafetyRuleCacheTtlSeconds: AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
        aiSafetyForensicLoggingEnabled: false,
        mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
        mcpImportValidationTtlMinutes:
          MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
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
          'aiSafetyForensicLoggingEnabled',
          'mcpMaxRequestBytes',
          'mcpImportMaxRows',
          'mcpImportValidationTtlMinutes',
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
          aiSafetyForensicLoggingEnabled: true,
          mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
          mcpImportValidationTtlMinutes:
            MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
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

  it('returns a bounded response for unexpected PUT failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    routeState.updateAiGenerationSettings.mockRejectedValueOnce(
      new Error('database unavailable'),
    )

    try {
      const response = await PUT(
        new NextRequest('https://example.test/api/admin/ai-settings', {
          body: JSON.stringify({
            aiSafetyRuleCacheTtlSeconds:
              AI_SAFETY_RULE_CACHE_TTL_DEFAULT_SECONDS,
            aiSafetyForensicLoggingEnabled: true,
            mcpImportMaxRows: MCP_IMPORT_MAX_ROWS_DEFAULT,
            mcpImportValidationTtlMinutes:
              MCP_IMPORT_VALIDATION_TTL_DEFAULT_MINUTES,
            mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
            requirementGenerationEnabled: true,
          }),
          method: 'PUT',
        }),
      )

      await expect(response.json()).resolves.toEqual({
        error: 'Failed to save AI settings.',
      })
      expect(response.status).toBe(500)
    } finally {
      errorSpy.mockRestore()
    }
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

  it('rejects an MCP row override above the global import row limit', async () => {
    routeState.patchAiGenerationSettings.mockRejectedValueOnce(
      new RequirementsServiceError('validation', 'Invalid AI settings', {
        details: { reason: 'mcp_import_max_rows_exceeds_global_limit' },
        httpStatus: 400,
      }),
    )

    const response = await PATCH(
      new NextRequest('https://example.test/api/admin/ai-settings', {
        body: JSON.stringify({ mcpImportMaxRows: 251 }),
        method: 'PATCH',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'validation',
    })
    expect(routeState.patchAiGenerationSettings).toHaveBeenCalledOnce()
  })

  it('rejects empty patches before DAL work', async () => {
    const response = await PATCH(
      new NextRequest('https://example.test/api/admin/ai-settings', {
        body: JSON.stringify({}),
        method: 'PATCH',
      }),
    )

    expect(response.status).toBe(400)
    expect(routeState.patchAiGenerationSettings).not.toHaveBeenCalled()
  })

  it.each([
    [
      new RequirementsServiceError('validation', 'Invalid AI settings', {
        httpStatus: 422,
      }),
      422,
      { code: 'validation', error: 'Invalid AI settings' },
    ],
    [
      new Error('database unavailable'),
      500,
      { error: 'Failed to save AI settings.' },
    ],
  ])(
    'maps PATCH failures to bounded HTTP responses',
    async (error, status, body) => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      routeState.patchAiGenerationSettings.mockRejectedValueOnce(error)

      try {
        const response = await PATCH(
          new NextRequest('https://example.test/api/admin/ai-settings', {
            body: JSON.stringify({ aiSafetyRuleCacheTtlSeconds: 300 }),
            method: 'PATCH',
          }),
        )

        await expect(response.json()).resolves.toEqual(body)
        expect(response.status).toBe(status)
      } finally {
        errorSpy.mockRestore()
      }
    },
  )
})
