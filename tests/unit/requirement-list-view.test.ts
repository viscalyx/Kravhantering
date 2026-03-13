import { describe, expect, it } from 'vitest'
import {
  buildRequirementListParams,
  clearRequirementFiltersForHiddenColumns,
  compareRequirementRows,
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  getRequirementColumnWidthsStorageKey,
  parseRequirementColumnWidths,
  parseRequirementVisibleColumns,
  serializeRequirementColumnWidths,
  serializeRequirementVisibleColumns,
} from '@/lib/requirements/list-view'

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    area: { name: 'Integration' },
    id: 1,
    isArchived: false,
    uniqueId: 'INT0001',
    version: {
      categoryNameEn: 'Alpha',
      categoryNameSv: 'Zulu',
      description: 'Secure integration',
      requiresTesting: true,
      status: 3,
      statusColor: '#22c55e',
      statusNameEn: 'Published',
      statusNameSv: 'Publicerad',
      typeCategoryNameEn: null,
      typeCategoryNameSv: null,
      typeNameEn: 'Functional',
      typeNameSv: 'Funktionellt',
      versionNumber: 2,
    },
    ...overrides,
  }
}

describe('requirement list view helpers', () => {
  it('builds requirement list params with locale and sort state', () => {
    const params = buildRequirementListParams({
      filters: {
        statuses: [3],
        uniqueIdSearch: 'INT',
      },
      limit: 200,
      locale: 'sv',
      sort: { by: 'status', direction: 'desc' },
    })

    expect(params.get('limit')).toBe('200')
    expect(params.get('locale')).toBe('sv')
    expect(params.get('sortBy')).toBe('status')
    expect(params.get('sortDirection')).toBe('desc')
    expect(params.get('uniqueIdSearch')).toBe('INT')
    expect(params.getAll('statuses')).toEqual(['3'])
  })

  it('omits the page limit for csv exports when no limit is provided', () => {
    const params = buildRequirementListParams({
      filters: {},
      format: 'csv',
      locale: 'sv',
      sort: { by: 'uniqueId', direction: 'asc' },
    })

    expect(params.get('format')).toBe('csv')
    expect(params.get('limit')).toBeNull()
  })

  it('parses stored visible columns while restoring locked columns', () => {
    expect(parseRequirementVisibleColumns('["area","status"]')).toEqual([
      'uniqueId',
      'description',
      'area',
      'status',
    ])
  })

  it('falls back to defaults when stored columns are invalid', () => {
    expect(parseRequirementVisibleColumns('{invalid')).toEqual(
      DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
    )
    expect(
      JSON.parse(serializeRequirementVisibleColumns(['status', 'type'])),
    ).toEqual(['uniqueId', 'description', 'type', 'status'])
  })

  it('clears hidden column filters while keeping locked-column filters intact', () => {
    expect(
      clearRequirementFiltersForHiddenColumns(
        {
          areaIds: [1],
          descriptionSearch: 'secure',
          statuses: [3],
          uniqueIdSearch: 'INT',
        },
        ['uniqueId', 'description'],
      ),
    ).toEqual({
      areaIds: undefined,
      descriptionSearch: 'secure',
      statuses: undefined,
      uniqueIdSearch: 'INT',
    })
  })

  it('parses stored column widths with clamping and ignores unknown columns', () => {
    expect(
      parseRequirementColumnWidths(
        JSON.stringify({
          category: 152,
          status: 999,
          unknown: 220,
          version: 20,
        }),
      ),
    ).toEqual({
      status: 280,
      version: 72,
    })
    expect(parseRequirementColumnWidths('{invalid')).toEqual({})
  })

  it('serializes only non-default width overrides and scopes the storage key by locale', () => {
    expect(
      JSON.parse(
        serializeRequirementColumnWidths({
          category: 190,
          status: 176,
        }),
      ),
    ).toEqual({ category: 190 })
    expect(getRequirementColumnWidthsStorageKey('sv')).toBe(
      'kravkatalog.columnWidths.v2.sv',
    )
  })

  it('compares rows using the active locale-specific label', () => {
    const left = makeRow({
      uniqueId: 'INT0001',
      version: {
        ...makeRow().version,
        categoryNameEn: 'Alpha',
        categoryNameSv: 'Zulu',
      },
    })
    const right = makeRow({
      id: 2,
      uniqueId: 'INT0002',
      version: {
        ...makeRow().version,
        categoryNameEn: 'Omega',
        categoryNameSv: 'Alfa',
      },
    })

    expect(
      compareRequirementRows(left, right, {
        locale: 'sv',
        sort: { by: 'category', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeGreaterThan(0)
    expect(
      compareRequirementRows(left, right, {
        locale: 'en',
        sort: { by: 'category', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeLessThan(0)
  })

  it('uses the selected locale for text collation', () => {
    const left = makeRow({
      uniqueId: 'INT0001',
      version: {
        ...makeRow().version,
        categoryNameEn: 'Aland',
        categoryNameSv: 'Åska',
      },
    })
    const right = makeRow({
      id: 2,
      uniqueId: 'INT0002',
      version: {
        ...makeRow().version,
        categoryNameEn: 'Zulu',
        categoryNameSv: 'Zulu',
      },
    })

    expect(
      compareRequirementRows(left, right, {
        locale: 'sv',
        sort: { by: 'category', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeGreaterThan(0)
    expect(
      compareRequirementRows(left, right, {
        locale: 'en',
        sort: { by: 'category', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeLessThan(0)
  })

  it('compares status rows by status sort order', () => {
    const left = makeRow({
      uniqueId: 'INT0001',
      version: { ...makeRow().version, status: 4 },
    })
    const right = makeRow({
      id: 2,
      uniqueId: 'INT0002',
      version: { ...makeRow().version, status: 3 },
    })

    expect(
      compareRequirementRows(left, right, {
        locale: 'sv',
        sort: { by: 'status', direction: 'asc' },
        statusOptions: [
          { id: 4, sortOrder: 1 },
          { id: 3, sortOrder: 2 },
        ],
      }),
    ).toBeLessThan(0)
  })
})
