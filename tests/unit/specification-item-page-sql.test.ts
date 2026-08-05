import { describe, expect, it, vi } from 'vitest'
import {
  buildSpecificationItemPageCandidateSql,
  enrichSpecificationItemPage,
  listSpecificationItemPageCandidates,
} from '@/lib/dal/specification-item-page'
import { REQUIREMENT_SORT_FIELDS } from '@/lib/requirements/list-view'

describe('specification item page SQL', () => {
  it('uses one bounded two-branch candidate query without offset or counts', () => {
    const { parameters, sqlText } = buildSpecificationItemPageCandidateSql({
      filters: {
        areaIds: [2],
        descriptionSearch: 'secure',
        normReferenceIds: [4],
        requirementPackageIds: [5],
      },
      limit: 51,
      locale: 'sv',
      sortBy: 'category',
      sortDirection: 'desc',
      specificationId: 7,
    })

    expect(sqlText).toContain('SELECT TOP (')
    expect(sqlText).toContain('UNION ALL')
    expect(sqlText).toContain('requirements_specification_items')
    expect(sqlText).toContain('specification_local_requirements')
    expect(sqlText).toContain('name_sv')
    expect(sqlText).toContain('ORDER BY candidate.nullRank ASC')
    expect(sqlText).not.toMatch(/\bOFFSET\b/iu)
    expect(sqlText).not.toMatch(/\bCOUNT\s*\(/iu)
    expect(sqlText).toContain(
      'current_package_version.requirement_id = requirement.id',
    )
    expect(sqlText).toContain(
      'current_package_version.requirement_status_id = 3',
    )
    expect(sqlText).toContain('page_package.is_archived = 0')
    expect(parameters).toContain(51)
  })

  it('resolves the full tuple seek from the encoded boundary', () => {
    const { parameters, sqlText } = buildSpecificationItemPageCandidateSql({
      after: {
        kindRank: 1,
        nullRank: 0,
        sortValue: 'Integration',
        sourceId: 42,
        uniqueId: 'INT0042',
      },
      filters: {},
      limit: 11,
      locale: 'en',
      sortBy: 'description',
      sortDirection: 'asc',
      specificationId: 7,
    })

    expect(sqlText).toContain('anchor AS')
    expect(sqlText).not.toContain('WHERE candidate.sourceId =')
    expect(sqlText).toContain('candidate.nullRank > anchor.nullRank')
    expect(sqlText).toContain('candidate.sortValue > anchor.sortValue')
    expect(sqlText).toContain('candidate.uniqueId > anchor.uniqueId')
    expect(sqlText).toContain('candidate.kindRank > anchor.kindRank')
    expect(sqlText).toContain('candidate.sourceId > anchor.sourceId')
    expect(parameters).toEqual(
      expect.arrayContaining([1, 0, 'Integration', 42, 'INT0042']),
    )
  })

  it('restricts match probes to requested library requirement IDs', () => {
    const { parameters, sqlText } = buildSpecificationItemPageCandidateSql({
      filters: { requirementIds: [31, 32] },
      limit: 3,
      locale: 'en',
      sortBy: 'uniqueId',
      sortDirection: 'asc',
      specificationId: 7,
    })

    expect(sqlText).toContain(
      'requirement.id IN (SELECT TRY_CONVERT(int, [value]) FROM OPENJSON(',
    )
    expect(sqlText).toContain('1 = 0')
    expect(parameters).toContain(JSON.stringify([31, 32]))
  })

  it('binds every supported filter for both candidate sources', () => {
    const { parameters, sqlText } = buildSpecificationItemPageCandidateSql({
      filters: {
        areaIds: [2],
        categoryIds: [3],
        descriptionSearch: String.raw`secure%_[\]`,
        needsReferenceIds: [4],
        normReferenceIds: [5],
        priorityLevelIds: [6],
        qualityCharacteristicIds: [7],
        requirementIds: [8],
        requirementPackageIds: [9],
        specificationItemStatusIds: [10],
        statuses: [2],
        typeIds: [11],
        uniqueIdSearch: 'REQ-',
        verifiable: ['invalid', 'true', 'false'],
      },
      limit: 51,
      locale: 'en',
      sortBy: 'uniqueId',
      sortDirection: 'asc',
      specificationId: 7,
    })

    expect(sqlText).toContain('requirement_version.is_verifiable')
    expect(sqlText).toContain('local_requirement.is_verifiable')
    expect(sqlText).toContain('specification_local_requirement_norm_references')
    expect(sqlText.match(/1 = 0/gu)?.length).toBeGreaterThanOrEqual(4)
    expect(parameters).toContain(JSON.stringify([1, 0]))
    expect(parameters).toContain(String.raw`%secure\%\_\[\\\]%`)
  })

  it('ignores a boolean filter without supported values', () => {
    const { parameters, sqlText } = buildSpecificationItemPageCandidateSql({
      filters: { verifiable: ['unknown'] },
      limit: 2,
      locale: 'en',
      sortBy: 'uniqueId',
      sortDirection: 'asc',
      specificationId: 7,
    })

    expect(sqlText).not.toContain('CAST(requirement_version.is_verifiable')
    expect(parameters).not.toContain(JSON.stringify([]))
  })

  it('uses the unique ID tuple for a descending continuation seek', () => {
    const { sqlText } = buildSpecificationItemPageCandidateSql({
      after: {
        kindRank: 0,
        nullRank: 0,
        sortValue: 'REQ-042',
        sourceId: 42,
        uniqueId: 'REQ-042',
      },
      filters: {},
      limit: 11,
      locale: 'en',
      sortBy: 'uniqueId',
      sortDirection: 'desc',
      specificationId: 7,
    })

    expect(sqlText).toContain('candidate.sortValue < anchor.sortValue')
    expect(sqlText).toContain('candidate.sortValue = anchor.sortValue')
    expect(sqlText).not.toContain('candidate.nullRank > anchor.nullRank')
  })

  it('maps database candidate types into stable cursor boundaries', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        kindRank: 1,
        nullRank: 1,
        sortValue: null,
        sourceId: '41',
        uniqueId: null,
      },
      {
        kindRank: 0,
        nullRank: 0,
        sortValue: 'Description',
        sourceId: 31,
        uniqueId: 'REQ-031',
      },
      {
        kindRank: 2,
        nullRank: 2,
        sortValue: 12,
        sourceId: 32,
        uniqueId: 'REQ-032',
      },
    ])

    const result = await listSpecificationItemPageCandidates(
      { query } as never,
      {
        filters: {},
        limit: 3,
        locale: 'en',
        sortBy: 'version',
        sortDirection: 'asc',
        specificationId: 7,
      },
    )

    expect(result).toEqual([
      {
        kindRank: 1,
        nullRank: 1,
        sortValue: null,
        sourceId: 41,
        uniqueId: '',
      },
      {
        kindRank: 0,
        nullRank: 0,
        sortValue: 'Description',
        sourceId: 31,
        uniqueId: 'REQ-031',
      },
      {
        kindRank: 0,
        nullRank: 0,
        sortValue: 12,
        sourceId: 32,
        uniqueId: 'REQ-032',
      },
    ])
    expect(query).toHaveBeenCalledWith(expect.any(String), [7, 7, 3])
  })

  it.each(
    REQUIREMENT_SORT_FIELDS.flatMap(sortBy =>
      (['asc', 'desc'] as const).map(sortDirection => ({
        sortBy,
        sortDirection,
      })),
    ),
  )('supports $sortBy $sortDirection with stable tie-breakers', input => {
    const { sqlText } = buildSpecificationItemPageCandidateSql({
      filters: {},
      limit: 51,
      locale: 'sv',
      specificationId: 7,
      ...input,
    })

    expect(sqlText).toContain('candidate.kindRank ASC')
    expect(sqlText).toContain('candidate.sourceId ASC')
    if (input.sortBy !== 'uniqueId') {
      expect(sqlText).toContain('candidate.nullRank ASC')
      expect(sqlText).toContain('candidate.uniqueId ASC')
    }
    expect(sqlText).toContain(
      `candidate.sortValue ${input.sortDirection.toUpperCase()}`,
    )
  })

  it('hydrates only selected IDs and restores candidate order', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          areaName: 'Security',
          description: 'Library item',
          deviationApproved: 1,
          deviationPending: 1,
          deviationTotal: 2,
          isArchived: true,
          needsReferenceId: 'not-a-number',
          normReferenceIds: ' NORM-1, , NORM-2 ',
          requirementId: 11,
          requirementPackageIds: '2, invalid, -1, 3',
          sourceId: 31,
          specificationItemStatusId: 1,
          statusId: 3,
          uniqueId: 'REQ-001',
          verifiable: true,
          versionNumber: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          description: 'Local item',
          sourceId: 41,
          specificationItemStatusId: null,
          uniqueId: 'LOCAL-001',
        },
      ])
    const db = { query } as never
    const candidates = [
      {
        kindRank: 1 as const,
        nullRank: 0 as const,
        sortValue: 'LOCAL-001',
        sourceId: 41,
        uniqueId: 'LOCAL-001',
      },
      {
        kindRank: 0 as const,
        nullRank: 0 as const,
        sortValue: 'REQ-001',
        sourceId: 31,
        uniqueId: 'REQ-001',
      },
    ]

    const rows = await enrichSpecificationItemPage(db, 7, candidates)

    expect(rows.map(row => row.itemRef)).toEqual(['local:41', 'lib:31'])
    expect(rows[0]?.specificationItemStatusId).toBeNull()
    expect(rows[1]?.specificationItemStatusId).toBe(1)
    expect(rows[1]).toMatchObject({
      area: { name: 'Security' },
      deviationCount: 2,
      hasApprovedDeviation: true,
      hasPendingDeviation: true,
      isArchived: true,
      needsReferenceId: null,
      normReferenceIds: ['NORM-1', 'NORM-2'],
      requirementPackageIds: [2, 3],
      version: { verifiable: true },
    })
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]?.[0]).toContain(
      'current_package_version.requirement_id = requirement.id',
    )
    expect(query.mock.calls[0]?.[0]).toContain(
      'current_package_version.requirement_status_id = 3',
    )
    expect(query.mock.calls[0]?.[1]).toEqual([7, 31])
    expect(query.mock.calls[1]?.[1]).toEqual([7, 41])
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'priority_level.code AS priorityLevelCode',
    )
    expect(String(query.mock.calls[1]?.[0])).toContain(
      'priority_level.code AS priorityLevelCode',
    )
  })

  it('does not query hydration tables for an empty candidate page', async () => {
    const query = vi.fn()

    await expect(
      enrichSpecificationItemPage({ query } as never, 7, []),
    ).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })
})
