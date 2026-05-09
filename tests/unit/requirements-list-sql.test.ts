import { describe, expect, it } from 'vitest'
import {
  buildRequirementCountSql,
  buildRequirementListSql,
  STATUS_PUBLISHED,
} from '@/lib/dal/requirements-list-sql.mjs'

describe('requirement list SQL builders', () => {
  it('builds the list query with stable parameter ordering', () => {
    const query = buildRequirementListSql({
      areaIds: [1, 2],
      categoryIds: [2],
      descriptionSearch: 'needle',
      limit: 25,
      locale: 'sv',
      normReferenceIds: [1, 6],
      offset: 50,
      qualityCharacteristicIds: [6],
      requirementPackageIds: [8],
      requiresTesting: [true, false],
      riskLevelIds: [3],
      sortBy: 'status',
      sortDirection: 'desc',
      statuses: [STATUS_PUBLISHED],
      typeIds: [1],
      uniqueIdSearch: 'PERF',
    })

    expect(query.parameters).toEqual([
      1,
      2,
      '%PERF%',
      '%needle%',
      STATUS_PUBLISHED,
      2,
      1,
      6,
      3,
      1,
      0,
      1,
      6,
      8,
      50,
      25,
    ])
    expect(query.sqlText).toContain('requirement.is_archived = 0')
    expect(query.sqlText).toContain(
      'requirement.requirement_area_id IN (@0, @1)',
    )
    expect(query.sqlText).toContain('requirement.unique_id LIKE @2')
    expect(query.sqlText).toContain('version.description LIKE @3')
    expect(query.sqlText).toContain('version.requirement_category_id IN (@5)')
    expect(query.sqlText).toContain('version.requirement_type_id IN (@6)')
    expect(query.sqlText).toContain('version.quality_characteristic_id IN (@7)')
    expect(query.sqlText).toContain('version.risk_level_id IN (@8)')
    expect(query.sqlText).toContain(
      'CAST(version.is_testing_required AS int) IN (@9, @10)',
    )
    expect(query.sqlText).toContain('vnr.norm_reference_id IN (@11, @12)')
    expect(query.sqlText).toContain('vus.requirement_package_id IN (@13)')
    expect(query.sqlText).toContain('OFFSET @14 ROWS FETCH NEXT @15 ROWS ONLY')
    expect(query.sqlText).toContain('ORDER BY CASE WHEN (SELECT rs.sort_order')
  })

  it('builds the count query from the same filters without pagination', () => {
    const query = buildRequirementCountSql({
      areaIds: [1],
      limit: 25,
      offset: 50,
      statuses: [STATUS_PUBLISHED],
    })

    expect(query.parameters).toEqual([1, STATUS_PUBLISHED])
    expect(query.sqlText).toContain(
      'SELECT COUNT(DISTINCT requirement.id) AS [count]',
    )
    expect(query.sqlText).toContain('requirement.requirement_area_id IN (@0)')
    expect(query.sqlText).not.toContain('ORDER BY')
    expect(query.sqlText).not.toContain('FETCH NEXT')
  })

  it('omits the active-only filter when archived rows are explicitly included', () => {
    const query = buildRequirementListSql({
      includeArchived: true,
      limit: 10,
    })

    expect(query.sqlText).not.toContain('WHERE requirement.is_archived = 0')
    expect(query.parameters).toEqual([0, 10])
  })
})
