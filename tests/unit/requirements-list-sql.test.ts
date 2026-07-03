import { describe, expect, it } from 'vitest'
import {
  buildRequirementCountSql,
  buildRequirementListSql,
  escapeLike,
} from '@/lib/dal/requirements-list-sql.mjs'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'

describe('requirement list SQL builders', () => {
  it('builds the list query with stable parameter ordering', () => {
    const query = buildRequirementListSql({
      areaIds: [1, 2],
      categoryIds: [2],
      descriptionSearch: String.raw`need\%_[le`,
      limit: 25,
      locale: 'sv',
      normReferenceIds: [1, 6],
      offset: 50,
      qualityCharacteristicIds: [6],
      requirementPackageIds: [8],
      verifiable: [true, false],
      priorityLevelIds: [3],
      sortBy: 'status',
      sortDirection: 'desc',
      statuses: [STATUS_PUBLISHED],
      typeIds: [1],
      uniqueIdSearch: String.raw`PERF\%_[`,
    })

    expect(query.parameters).toEqual([
      1,
      2,
      String.raw`%PERF\\\%\_\[%`,
      String.raw`%need\\\%\_\[le%`,
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
    expect(query.sqlText).toContain(
      String.raw`requirement.unique_id LIKE @2 ESCAPE '\'`,
    )
    expect(query.sqlText).toContain(
      String.raw`version.description LIKE @3 ESCAPE '\'`,
    )
    expect(query.sqlText).toContain(
      String.raw`version.acceptance_criteria LIKE @3 ESCAPE '\'`,
    )
    expect(query.sqlText).toContain('version.requirement_category_id IN (@5)')
    expect(query.sqlText).toContain('version.requirement_type_id IN (@6)')
    expect(query.sqlText).toContain('version.quality_characteristic_id IN (@7)')
    expect(query.sqlText).toContain('version.priority_level_id IN (@8)')
    expect(query.sqlText).toContain(
      'CAST(version.is_verifiable AS int) IN (@9, @10)',
    )
    expect(query.sqlText).toContain('vnr.norm_reference_id IN (@11, @12)')
    expect(query.sqlText).toContain('vus.requirement_package_id IN (@13)')
    expect(query.sqlText).toContain('AS requirementPackagesJson')
    expect(query.sqlText).toContain(
      'JOIN requirement_packages requirement_package',
    )
    expect(query.sqlText).toContain('FOR JSON PATH')
    expect(query.sqlText).toContain('OFFSET @14 ROWS FETCH NEXT @15 ROWS ONLY')
    expect(query.sqlText).toContain(
      'effective_status.effective_status_id AS status',
    )
    expect(query.sqlText).toContain(
      'requirement_status.name_sv AS statusNameSv',
    )
    expect(query.sqlText).toContain('ORDER BY CASE WHEN requirement_status')
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
    expect(query.sqlText).not.toContain('LEFT JOIN requirement_areas')
    expect(query.sqlText).not.toContain('LEFT JOIN requirement_categories')
    expect(query.sqlText).not.toContain('LEFT JOIN requirement_types')
    expect(query.sqlText).not.toContain('LEFT JOIN quality_characteristics')
    expect(query.sqlText).not.toContain('LEFT JOIN priority_levels')
  })

  it('omits the active-only filter when archived rows are explicitly included', () => {
    const query = buildRequirementListSql({
      includeArchived: true,
      limit: 10,
    })

    expect(query.sqlText).not.toContain('WHERE requirement.is_archived = 0')
    expect(query.parameters).toEqual([0, 10])
  })

  it('orders requirement package JSON by the selected locale', () => {
    const svQuery = buildRequirementListSql({ locale: 'sv', limit: 10 })
    const enQuery = buildRequirementListSql({ locale: 'en', limit: 10 })
    const fallbackQuery = buildRequirementListSql({
      locale: 'unsupported' as never,
      limit: 10,
    })

    expect(svQuery.sqlText).toContain(
      'LOWER(requirement_package.name) ASC, requirement_package.id ASC',
    )
    expect(enQuery.sqlText).toContain(
      'LOWER(requirement_package.name) ASC, requirement_package.id ASC',
    )
    expect(fallbackQuery.sqlText).toContain(
      'LOWER(requirement_package.name) ASC, requirement_package.id ASC',
    )
  })

  it('escapes SQL Server LIKE wildcard characters', () => {
    expect(escapeLike(String.raw`A\%_[B`)).toBe(String.raw`A\\\%\_\[B`)
  })
})
