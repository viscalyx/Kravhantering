import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  APPLICATION_SETTING_CONSTRAINTS,
  DEFAULT_APPLICATION_SETTINGS,
  MIB,
} from '@/lib/application-settings'

const routeState = vi.hoisted(() => {
  const adminContext = {
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-settings',
    request: {
      method: 'PATCH',
      path: '/api/admin/application-settings',
      requestId: 'request-settings',
    },
    requestId: 'request-settings',
    source: 'rest',
  }
  return {
    adminContext,
    createAdminPrivilegedAuditContext: vi.fn(async () => adminContext),
    createRequestContext: vi.fn(async () => adminContext),
    getAdminApplicationSettings: vi.fn(),
    getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
    recordAdminPrivilegedActionSucceeded: vi.fn(async () => {}),
    updateApplicationSetting: vi.fn(),
  }
})

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext:
    routeState.createAdminPrivilegedAuditContext,
  recordAdminPrivilegedActionSucceeded:
    routeState.recordAdminPrivilegedActionSucceeded,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createDefaultAuthorizationService: () => ({
    assertAuthorized: vi.fn(),
  }),
  createRequestContext: routeState.createRequestContext,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getAdminApplicationSettings: routeState.getAdminApplicationSettings,
  updateApplicationSetting: routeState.updateApplicationSetting,
}))

import { GET, PATCH } from '@/app/api/admin/application-settings/route'

describe('admin application settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.getAdminApplicationSettings.mockResolvedValue({
      ...DEFAULT_APPLICATION_SETTINGS,
      constraints: APPLICATION_SETTING_CONSTRAINTS,
      updatedAt: '2026-07-18T12:00:00.000Z',
    })
    routeState.updateApplicationSetting.mockImplementation(
      async (_db, field, value, options) => {
        await options.audit(
          { query: vi.fn() },
          {
            field,
            newValue: value,
            oldValue: 5,
          },
        )
        return {
          field,
          updatedAt: '2026-07-18T12:01:00.000Z',
          value,
        }
      },
    )
  })

  it('returns no-store settings to Admin', async () => {
    const response = await GET(
      new NextRequest('https://example.test/api/admin/application-settings'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject(DEFAULT_APPLICATION_SETTINGS)
  })

  it('rejects non-Admin reads before database access', async () => {
    routeState.createRequestContext.mockResolvedValueOnce({
      ...routeState.adminContext,
      actor: {
        ...routeState.adminContext.actor,
        roles: ['Reviewer'],
      },
    })
    const response = await GET(
      new NextRequest('https://example.test/api/admin/application-settings'),
    )

    expect(response.status).toBe(403)
    expect(routeState.getAdminApplicationSettings).not.toHaveBeenCalled()
  })

  it('requires exactly one allowlisted valid field', async () => {
    for (const body of [
      {},
      {
        csvExportConcurrencyPerNode: 4,
        pdfReportConcurrencyPerNode: 2,
      },
      { csvExportMaxFileBytes: MIB + 1 },
      { csvExportMaxRequirements: 100, unknown: 1 },
    ]) {
      const response = await PATCH(
        new NextRequest('https://example.test/api/admin/application-settings', {
          body: JSON.stringify(body),
          method: 'PATCH',
        }),
      )
      expect(response.status).toBe(400)
    }
    expect(routeState.updateApplicationSetting).not.toHaveBeenCalled()
  })

  it('updates one field and writes old/new privileged audit', async () => {
    const response = await PATCH(
      new NextRequest('https://example.test/api/admin/application-settings', {
        body: JSON.stringify({ csvExportConcurrencyPerNode: 8 }),
        method: 'PATCH',
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.updateApplicationSetting).toHaveBeenCalledWith(
      { db: true },
      'csvExportConcurrencyPerNode',
      8,
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-settings' }),
      {
        changedFields: ['csvExportConcurrencyPerNode'],
        details: { newValue: 8, oldValue: 5 },
        operation: 'update',
        resourceId: 'global',
        resourceType: 'application_settings',
      },
      expect.anything(),
    )
  })
})
