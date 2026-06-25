import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    request: {
      method: 'PUT',
      path: '/api/admin/requirement-columns',
      requestId: 'request-2',
    },
    correlationId: 'correlation-2',
    requestId: 'request-2',
    source: 'rest',
  })),
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  getRequirementListColumnDefaults: vi.fn(),
  recordAdminPrivilegedActionSucceeded: vi.fn(),
  updateRequirementListColumnDefaults: vi.fn(),
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

vi.mock('@/lib/dal/ui-settings', () => ({
  formatUiSettingsLoadError: (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  }),
  getRequirementListColumnDefaults: routeState.getRequirementListColumnDefaults,
  updateRequirementListColumnDefaults:
    routeState.updateRequirementListColumnDefaults,
}))

import { GET, PUT } from '@/app/api/admin/requirement-columns/route'
import { normalizeRequirementListColumnDefaults } from '@/lib/requirements/list-view'

describe('admin requirement columns route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const columns = normalizeRequirementListColumnDefaults([
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
      { columnId: 'description', defaultVisible: true, sortOrder: 1 },
      { columnId: 'status', defaultVisible: true, sortOrder: 2 },
      { columnId: 'area', defaultVisible: true, sortOrder: 3 },
      { columnId: 'category', defaultVisible: true, sortOrder: 4 },
      { columnId: 'type', defaultVisible: true, sortOrder: 5 },
      {
        columnId: 'qualityCharacteristic',
        defaultVisible: false,
        sortOrder: 6,
      },
      { columnId: 'requiresTesting', defaultVisible: false, sortOrder: 7 },
      { columnId: 'version', defaultVisible: false, sortOrder: 8 },
    ])

    routeState.getRequirementListColumnDefaults.mockResolvedValue(columns)
    routeState.updateRequirementListColumnDefaults.mockImplementation(
      async (_db, _values, options) => {
        await options?.audit?.({ query: vi.fn() })
        return columns
      },
    )
  })

  it('returns the stored column defaults payload', async () => {
    const response = await GET()
    const body = (await response.json()) as {
      columns?: Array<{ columnId: string }>
    }

    expect(response.status).toBe(200)
    expect(body.columns?.map(column => column.columnId)).toEqual([
      'uniqueId',
      'description',
      'status',
      'area',
      'category',
      'type',
      'qualityCharacteristic',
      'priorityLevel',
      'requiresTesting',
      'version',
      'needsReference',
      'specificationItemStatus',
      'normReferences',
      'requirementPackage',
      'suggestionCount',
    ])
  })

  it('returns 500 when loading stored requirement column defaults fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getRequirementListColumnDefaults.mockRejectedValueOnce(
      new Error('column defaults unavailable'),
    )

    try {
      const response = await GET()
      const body = (await response.json()) as { error?: string }

      expect(response.status).toBe(500)
      expect(body.error).toBe('Failed to load requirement column defaults.')
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load stored requirement column defaults',
        expect.objectContaining({
          message: 'column defaults unavailable',
        }),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('rejects unknown requirement column ids', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/requirement-columns', {
        body: JSON.stringify({
          columns: [
            {
              columnId: 'unknownColumn',
              defaultVisible: true,
              sortOrder: 0,
            },
          ],
        }),
        method: 'PUT',
      }),
    )

    expect(response.status).toBe(400)
    expect(
      routeState.updateRequirementListColumnDefaults,
    ).not.toHaveBeenCalled()
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('rejects duplicate requirement column ids', async () => {
    const columns = normalizeRequirementListColumnDefaults([])
    const duplicateColumns = columns.map((column, index) =>
      index === 1 ? { ...column, columnId: columns[0].columnId } : column,
    )

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/requirement-columns', {
        body: JSON.stringify({
          columns: duplicateColumns,
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as {
      error?: string
      issues?: Array<{ message: string }>
    }

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Each requirement column must be provided exactly once.',
        }),
      ]),
    )
    expect(
      routeState.updateRequirementListColumnDefaults,
    ).not.toHaveBeenCalled()
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('rejects duplicate requirement column sort orders', async () => {
    const columns = normalizeRequirementListColumnDefaults([])
    const duplicateSortOrders = columns.map((column, index) =>
      index === 1 ? { ...column, sortOrder: columns[0].sortOrder } : column,
    )

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/requirement-columns', {
        body: JSON.stringify({
          columns: duplicateSortOrders,
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as {
      error?: string
      issues?: Array<{ message: string }>
    }

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Each requirement column sort order must be unique.',
        }),
      ]),
    )
    expect(
      routeState.updateRequirementListColumnDefaults,
    ).not.toHaveBeenCalled()
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('returns the reordered column defaults payload after a successful save', async () => {
    const reorderedColumns = normalizeRequirementListColumnDefaults([
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
      { columnId: 'description', defaultVisible: true, sortOrder: 1 },
      { columnId: 'category', defaultVisible: true, sortOrder: 2 },
      { columnId: 'area', defaultVisible: true, sortOrder: 3 },
      { columnId: 'type', defaultVisible: true, sortOrder: 4 },
      {
        columnId: 'qualityCharacteristic',
        defaultVisible: false,
        sortOrder: 5,
      },
      { columnId: 'status', defaultVisible: true, sortOrder: 6 },
      { columnId: 'requiresTesting', defaultVisible: false, sortOrder: 7 },
      { columnId: 'version', defaultVisible: false, sortOrder: 8 },
    ])
    routeState.updateRequirementListColumnDefaults.mockImplementationOnce(
      async (_db, _values, options) => {
        await options?.audit?.({ query: vi.fn() })
        return reorderedColumns
      },
    )

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/requirement-columns', {
        body: JSON.stringify({
          columns: reorderedColumns,
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as {
      columns?: Array<{ columnId: string }>
    }

    expect(response.status).toBe(200)
    expect(routeState.updateRequirementListColumnDefaults).toHaveBeenCalledWith(
      { db: true },
      reorderedColumns,
      expect.objectContaining({ audit: expect.any(Function) }),
    )
    expect(body.columns?.map(column => column.columnId)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
      'qualityCharacteristic',
      'priorityLevel',
      'status',
      'requiresTesting',
      'version',
      'needsReference',
      'specificationItemStatus',
      'normReferences',
      'requirementPackage',
      'suggestionCount',
    ])
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-2' }),
      {
        itemCount: reorderedColumns.length,
        operation: 'save',
        resourceType: 'requirement_columns',
      },
      expect.anything(),
    )
  })

  it('returns a structured error response when saving the column defaults fails', async () => {
    routeState.updateRequirementListColumnDefaults.mockRejectedValueOnce(
      new Error('unique constraint failed'),
    )

    const response = await PUT(
      new NextRequest('https://example.test/api/admin/requirement-columns', {
        body: JSON.stringify({
          columns: normalizeRequirementListColumnDefaults([
            { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
            { columnId: 'description', defaultVisible: true, sortOrder: 1 },
            { columnId: 'category', defaultVisible: true, sortOrder: 2 },
            { columnId: 'area', defaultVisible: true, sortOrder: 3 },
            { columnId: 'type', defaultVisible: true, sortOrder: 4 },
            {
              columnId: 'qualityCharacteristic',
              defaultVisible: false,
              sortOrder: 5,
            },
            { columnId: 'status', defaultVisible: true, sortOrder: 6 },
            {
              columnId: 'requiresTesting',
              defaultVisible: false,
              sortOrder: 7,
            },
            { columnId: 'version', defaultVisible: false, sortOrder: 8 },
          ]),
        }),
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { error?: string }

    expect(response.status).toBe(500)
    expect(body.error).toBe('Failed to save requirement column defaults.')
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })

  it('returns a validation error for malformed JSON payloads', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/requirement-columns', {
        body: '{"columns": [',
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as {
      error?: string
      issues?: Array<{ message: string }>
    }

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid request')
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Malformed JSON body' }),
      ]),
    )
    expect(
      routeState.updateRequirementListColumnDefaults,
    ).not.toHaveBeenCalled()
    expect(
      routeState.recordAdminPrivilegedActionSucceeded,
    ).not.toHaveBeenCalled()
  })
})
