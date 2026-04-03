import { describe, expect, it } from 'vitest'
import {
  buildRequirementListParams,
  clearRequirementFiltersForHiddenColumns,
  compareRequirementRows,
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  getDefaultVisibleRequirementColumns,
  getRequirementColumnOrder,
  getRequirementColumnWidthsStorageKey,
  hasActiveFilters,
  isRequirementSortDirection,
  isRequirementSortField,
  normalizeRequirementListColumnDefaults,
  parseRequirementColumnWidths,
  parseRequirementVisibleColumns,
  REQUIREMENT_LIST_COLUMNS,
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
      qualityCharacteristicNameEn: null,
      qualityCharacteristicNameSv: null,
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
        needsReferenceIds: [10, 11],
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
    expect(params.getAll('needsReferenceIds')).toEqual(['10', '11'])
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

  it('applies admin-managed column order and visibility defaults', () => {
    const columnDefaults = normalizeRequirementListColumnDefaults([
      { columnId: 'description', defaultVisible: true, sortOrder: 0 },
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 1 },
      { columnId: 'status', defaultVisible: true, sortOrder: 2 },
      { columnId: 'area', defaultVisible: false, sortOrder: 3 },
      { columnId: 'category', defaultVisible: false, sortOrder: 4 },
      { columnId: 'type', defaultVisible: false, sortOrder: 5 },
      {
        columnId: 'qualityCharacteristic',
        defaultVisible: false,
        sortOrder: 6,
      },
      { columnId: 'requiresTesting', defaultVisible: false, sortOrder: 7 },
      { columnId: 'version', defaultVisible: false, sortOrder: 8 },
    ])

    expect(getRequirementColumnOrder(columnDefaults)).toEqual([
      'description',
      'uniqueId',
      'status',
      'area',
      'category',
      'type',
      'qualityCharacteristic',
      'requiresTesting',
      'version',
      'needsReference',
    ])
    expect(getDefaultVisibleRequirementColumns(columnDefaults)).toEqual([
      'description',
      'uniqueId',
      'status',
    ])
    expect(
      parseRequirementVisibleColumns('["status"]', { columnDefaults }),
    ).toEqual(['description', 'uniqueId', 'status'])
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
          needsReferenceIds: [9],
          qualityCharacteristicIds: [5],
          statuses: [3],
          uniqueIdSearch: 'INT',
        },
        ['uniqueId', 'description'],
      ),
    ).toEqual({
      areaIds: undefined,
      descriptionSearch: 'secure',
      needsReferenceIds: undefined,
      qualityCharacteristicIds: undefined,
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
      'requirements.columnWidths.v3.sv',
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

  it('hasActiveFilters returns false for default filters', () => {
    expect(hasActiveFilters({ statuses: [3] })).toBe(false)
  })

  it('hasActiveFilters returns true when statuses differ from default', () => {
    expect(hasActiveFilters({})).toBe(true)
  })

  it('hasActiveFilters returns true for non-default filters', () => {
    expect(hasActiveFilters({ areaIds: [1] })).toBe(true)
    expect(hasActiveFilters({ categoryIds: [2] })).toBe(true)
    expect(hasActiveFilters({ typeIds: [1] })).toBe(true)
    expect(hasActiveFilters({ qualityCharacteristicIds: [1] })).toBe(true)
    expect(hasActiveFilters({ requiresTesting: ['true'] })).toBe(true)
    expect(hasActiveFilters({ needsReferenceIds: [10] })).toBe(true)
    expect(hasActiveFilters({ uniqueIdSearch: 'INT' })).toBe(true)
    expect(hasActiveFilters({ descriptionSearch: 'test' })).toBe(true)
    expect(hasActiveFilters({ statuses: [1, 2] })).toBe(true)
  })

  it('isRequirementSortField validates field names', () => {
    expect(isRequirementSortField('uniqueId')).toBe(true)
    expect(isRequirementSortField('description')).toBe(true)
    expect(isRequirementSortField('area')).toBe(true)
    expect(isRequirementSortField('qualityCharacteristic')).toBe(true)
    expect(isRequirementSortField('invalid')).toBe(false)
  })

  it('isRequirementSortDirection validates direction values', () => {
    expect(isRequirementSortDirection('asc')).toBe(true)
    expect(isRequirementSortDirection('desc')).toBe(true)
    expect(isRequirementSortDirection('invalid')).toBe(false)
  })

  it('normalizeRequirementListColumnDefaults rejects duplicated column ids', () => {
    const result = normalizeRequirementListColumnDefaults([
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 1 },
    ])
    expect(result[0].columnId).toBe('uniqueId')
    expect(result.length).toBe(REQUIREMENT_LIST_COLUMNS.length)
  })

  it('compares rows by description', () => {
    const left = makeRow({
      version: { ...makeRow().version, description: 'Alpha' },
    })
    const right = makeRow({
      id: 2,
      uniqueId: 'INT0002',
      version: { ...makeRow().version, description: 'Zulu' },
    })
    expect(
      compareRequirementRows(left, right, {
        locale: 'en',
        sort: { by: 'description', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeLessThan(0)
  })

  it('compares rows by area', () => {
    const left = makeRow({ area: { name: 'AAA' } })
    const right = makeRow({
      id: 2,
      uniqueId: 'INT0002',
      area: { name: 'ZZZ' },
    })
    expect(
      compareRequirementRows(left, right, {
        locale: 'en',
        sort: { by: 'area', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeLessThan(0)
  })

  it('compares rows by type using locale', () => {
    const left = makeRow({
      version: {
        ...makeRow().version,
        typeNameEn: 'Alpha',
        typeNameSv: 'Zulu',
      },
    })
    const right = makeRow({
      id: 2,
      uniqueId: 'INT0002',
      version: {
        ...makeRow().version,
        typeNameEn: 'Zulu',
        typeNameSv: 'Alpha',
      },
    })
    expect(
      compareRequirementRows(left, right, {
        locale: 'en',
        sort: { by: 'type', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeLessThan(0)
    expect(
      compareRequirementRows(left, right, {
        locale: 'sv',
        sort: { by: 'type', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeGreaterThan(0)
  })

  it('compares rows by qualityCharacteristic', () => {
    const left = makeRow({
      version: {
        ...makeRow().version,
        qualityCharacteristicNameEn: 'Alpha',
        qualityCharacteristicNameSv: 'Zulu',
      },
    })
    const right = makeRow({
      id: 2,
      uniqueId: 'INT0002',
      version: {
        ...makeRow().version,
        qualityCharacteristicNameEn: 'Zulu',
        qualityCharacteristicNameSv: 'Alpha',
      },
    })
    expect(
      compareRequirementRows(left, right, {
        locale: 'en',
        sort: { by: 'qualityCharacteristic', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeLessThan(0)
    expect(
      compareRequirementRows(left, right, {
        locale: 'sv',
        sort: { by: 'qualityCharacteristic', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeGreaterThan(0)
  })

  it('compares rows by version number', () => {
    const left = makeRow({
      version: { ...makeRow().version, versionNumber: 1 },
    })
    const right = makeRow({
      id: 2,
      uniqueId: 'INT0002',
      version: { ...makeRow().version, versionNumber: 3 },
    })
    expect(
      compareRequirementRows(left, right, {
        locale: 'en',
        sort: { by: 'version', direction: 'asc' },
        statusOptions: [],
      }),
    ).toBeLessThan(0)
    expect(
      compareRequirementRows(left, right, {
        locale: 'en',
        sort: { by: 'version', direction: 'desc' },
        statusOptions: [],
      }),
    ).toBeGreaterThan(0)
  })

  it('compares rows by uniqueId', () => {
    const left = makeRow({ uniqueId: 'INT0001' })
    const right = makeRow({ id: 2, uniqueId: 'INT0002' })
    expect(
      compareRequirementRows(left, right, {
        locale: 'en',
        sort: { by: 'uniqueId', direction: 'desc' },
        statusOptions: [],
      }),
    ).toBeGreaterThan(0)
  })
})
