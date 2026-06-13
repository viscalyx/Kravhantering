import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => {
  class HsaIdPrefixSettingsError extends Error {
    readonly code: string

    constructor(code: string, message: string) {
      super(message)
      this.name = 'HsaIdPrefixSettingsError'
      this.code = code
    }
  }

  return {
    createAdminPrivilegedAuditContext: vi.fn(async () => ({
      actor: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
        id: 'admin-sub',
        isAuthenticated: true,
        roles: ['Admin'],
        source: 'oidc',
      },
      correlationId: 'correlation-1',
      request: {
        method: 'PUT',
        path: '/api/admin/hsa-id-prefixes',
        requestId: 'request-1',
      },
      requestId: 'request-1',
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
      correlationId: 'correlation-1',
      request: {
        method: 'GET',
        path: '/api/admin/hsa-id-prefixes',
        requestId: 'request-1',
      },
      requestId: 'request-1',
      source: 'rest',
    })),
    getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
    HsaIdPrefixSettingsError,
    listHsaIdPrefixesForAdmin: vi.fn(),
    recordAdminPrivilegedActionSucceeded: vi.fn(),
    updateHsaIdPrefixes: vi.fn(),
  }
})

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext:
    routeState.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    routeState.recordAdminPrivilegedActionSucceeded,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  formatUiSettingsLoadError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  HsaIdPrefixSettingsError: routeState.HsaIdPrefixSettingsError,
  listHsaIdPrefixesForAdmin: routeState.listHsaIdPrefixesForAdmin,
  updateHsaIdPrefixes: routeState.updateHsaIdPrefixes,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService: () => ({
    assertAuthorized: vi.fn(),
  }),
  createRequestContext: routeState.createRequestContext,
}))

import { GET, PUT } from '@/app/api/admin/hsa-id-prefixes/route'

const storedPrefixes = [
  {
    id: 1,
    isDefault: true,
    isUsed: true,
    isVisible: true,
    label: null,
    prefix: 'SE5560000001',
  },
]

describe('admin HSA-id prefixes route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.listHsaIdPrefixesForAdmin.mockResolvedValue(storedPrefixes)
    routeState.updateHsaIdPrefixes.mockImplementation(
      async (_db, _values, options) => {
        await options?.audit?.({ query: vi.fn() })
        return storedPrefixes
      },
    )
  })

  it('returns the full admin prefix list for Admin users', async () => {
    const response = await GET(
      new NextRequest('https://example.test/api/admin/hsa-id-prefixes'),
    )
    const body = (await response.json()) as { prefixes?: unknown[] }

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(body.prefixes).toEqual(storedPrefixes)
    expect(routeState.listHsaIdPrefixesForAdmin).toHaveBeenCalledWith({
      db: true,
    })
  })

  it('rejects malformed prefix values before saving', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/hsa-id-prefixes', {
        body: JSON.stringify({
          prefixes: [
            {
              isDefault: true,
              isVisible: true,
              label: null,
              prefix: 'se5560000001',
            },
          ],
        }),
        method: 'PUT',
      }),
    )

    expect(response.status).toBe(400)
    expect(routeState.updateHsaIdPrefixes).not.toHaveBeenCalled()
  })

  it('saves prefixes with admin mutation policy and privileged audit', async () => {
    const payload = {
      prefixes: [
        {
          id: 1,
          isDefault: true,
          isVisible: true,
          label: 'Demo',
          prefix: 'SE5560000001',
        },
      ],
    }

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/hsa-id-prefixes', {
        body: JSON.stringify(payload),
        method: 'PUT',
      }),
    )

    expect(response.status).toBe(200)
    expect(routeState.updateHsaIdPrefixes).toHaveBeenCalledWith(
      { db: true },
      payload.prefixes,
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-1' }),
      {
        itemCount: 1,
        operation: 'save',
        resourceType: 'hsa_id_prefix',
      },
      expect.anything(),
    )
  })

  it('returns conflict when a used prefix is removed or changed', async () => {
    routeState.updateHsaIdPrefixes.mockRejectedValueOnce(
      new routeState.HsaIdPrefixSettingsError(
        'used_prefix_cannot_delete',
        'A used HSA-id prefix cannot be deleted. Hide it instead.',
      ),
    )

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/hsa-id-prefixes', {
        body: JSON.stringify({ prefixes: [] }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { code?: string }

    expect(response.status).toBe(409)
    expect(body.code).toBe('used_prefix_cannot_delete')
  })

  it('returns a bad request for default visibility rule failures', async () => {
    routeState.updateHsaIdPrefixes.mockRejectedValueOnce(
      new routeState.HsaIdPrefixSettingsError(
        'default_hidden',
        'The default HSA-id prefix must be visible.',
      ),
    )

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/hsa-id-prefixes', {
        body: JSON.stringify({
          prefixes: [
            {
              id: 1,
              isDefault: true,
              isVisible: true,
              label: null,
              prefix: 'SE5560000001',
            },
          ],
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { code?: string }

    expect(response.status).toBe(400)
    expect(body.code).toBe('default_hidden')
  })

  it('returns a bad request when a non-empty list has no visible prefix', async () => {
    routeState.updateHsaIdPrefixes.mockRejectedValueOnce(
      new routeState.HsaIdPrefixSettingsError(
        'visible_prefix_required',
        'At least one configured HSA-id prefix must be visible.',
      ),
    )

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/hsa-id-prefixes', {
        body: JSON.stringify({
          prefixes: [
            {
              id: 1,
              isDefault: false,
              isVisible: false,
              label: null,
              prefix: 'SE5560000001',
            },
          ],
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { code?: string }

    expect(response.status).toBe(400)
    expect(body.code).toBe('visible_prefix_required')
  })
})
