import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(() => ({ db: true })),
  getRequirementListColumnDefaults: vi.fn(),
  updateRequirementListColumnDefaults: vi.fn(),
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
    routeState.updateRequirementListColumnDefaults.mockResolvedValue(columns)
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
      'riskLevel',
      'requiresTesting',
      'version',
      'needsReference',
      'packageItemStatus',
      'normReferences',
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
    routeState.updateRequirementListColumnDefaults.mockResolvedValueOnce(
      reorderedColumns,
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
    )
    expect(body.columns?.map(column => column.columnId)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
      'qualityCharacteristic',
      'riskLevel',
      'status',
      'requiresTesting',
      'version',
      'needsReference',
      'packageItemStatus',
      'normReferences',
      'suggestionCount',
    ])
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
  })

  it('returns a validation error for malformed JSON payloads', async () => {
    const response = await PUT(
      new NextRequest('https://example.test/api/admin/requirement-columns', {
        body: '{"columns": [',
        method: 'PUT',
      }),
    )
    const body = (await response.json()) as { error?: string }

    expect(response.status).toBe(400)
    expect(body.error).toBe('Malformed JSON body.')
    expect(
      routeState.updateRequirementListColumnDefaults,
    ).not.toHaveBeenCalled()
  })
})
