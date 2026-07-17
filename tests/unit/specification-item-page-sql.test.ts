import { describe, expect, it, vi } from 'vitest'
import {
  buildSpecificationItemPageCandidateSql,
  enrichSpecificationItemPage,
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
    expect(parameters).toContain(51)
  })

  it('builds a full tuple seek from cursor state without an anchor lookup', () => {
    const { sqlText } = buildSpecificationItemPageCandidateSql({
      after: {
        kindRank: 1,
        nullRank: 0,
        sortValue: 'Shared value',
        sourceId: 42,
        uniqueId: 'REQ-0042',
      },
      filters: {},
      limit: 11,
      locale: 'en',
      sortBy: 'description',
      sortDirection: 'asc',
      specificationId: 7,
    })

    expect(sqlText).toContain('candidate.nullRank >')
    expect(sqlText).toContain('candidate.sortValue >')
    expect(sqlText).toContain('candidate.uniqueId >')
    expect(sqlText).toContain('candidate.kindRank >')
    expect(sqlText).toContain('candidate.sourceId >')
    expect(sqlText).not.toMatch(/anchor/iu)
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
  })

  it('hydrates only selected IDs and restores candidate order', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          description: 'Library item',
          requirementId: 11,
          sourceId: 31,
          specificationItemStatusId: 1,
          statusId: 3,
          uniqueId: 'REQ-001',
          versionNumber: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          description: 'Local item',
          sourceId: 41,
          specificationItemStatusId: 1,
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
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]?.[1]).toEqual([7, 31])
    expect(query.mock.calls[1]?.[1]).toEqual([7, 41])
  })
})
