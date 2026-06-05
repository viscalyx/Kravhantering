import { describe, expect, it, vi } from 'vitest'
import {
  cleanupRequirementSelectionPackageLinks,
  getExistingSpecificationRequirementIds,
  getRequirementSelectionFilterForSpecification,
  listRequirementSelectionMatchedRequirements,
  resolveRequirementSelectionQuestionId,
  setRequirementSelectionAnswerState,
  setRequirementSelectionQuestionState,
} from '@/lib/dal/requirement-selection-questions'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'

function createDb(rows: unknown[]) {
  return {
    query: vi.fn(async () => rows),
  } as unknown as Parameters<typeof getExistingSpecificationRequirementIds>[0]
}

function createTransactionalDb(query: ReturnType<typeof vi.fn>) {
  return {
    query,
    transaction: vi.fn(async (callback: (manager: unknown) => Promise<void>) =>
      callback({ query }),
    ),
  } as unknown as Parameters<typeof setRequirementSelectionQuestionState>[0]
}

describe('requirement selection questions DAL', () => {
  it('loads existing requirement ids through the specification item foreign key', async () => {
    const db = createDb([{ requirementId: 101 }, { requirementId: 102 }])

    await expect(
      getExistingSpecificationRequirementIds(db, 6),
    ).resolves.toEqual([101, 102])

    const query = vi.mocked(db.query)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('item.requirements_specification_id = @0'),
      [6],
    )
    expect(String(query.mock.calls[0]?.[0])).not.toContain(
      'item.specification_id',
    )
  })

  it('treats no-requirement-selection answers as answered without filtering available requirements', async () => {
    const query = vi.fn(async () => [
      { answerId: 4, isNoRequirementSelection: 1 },
    ])
    const db = { query } as unknown as Parameters<
      typeof getRequirementSelectionFilterForSpecification
    >[0]

    await expect(
      getRequirementSelectionFilterForSpecification(db, 9),
    ).resolves.toEqual({
      hasCurrentAnswers: true,
      hasRequirementSelection: false,
      hasNoRequirementSelection: true,
      requirementIds: [],
    })

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('filters explicit answer requirement links to requirements with a published version', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ answerId: 4, isNoRequirementSelection: 0 }])
      .mockResolvedValueOnce([{ requirementId: 101 }])
    const db = { query } as unknown as Parameters<
      typeof getRequirementSelectionFilterForSpecification
    >[0]

    await expect(
      getRequirementSelectionFilterForSpecification(db, 9),
    ).resolves.toEqual({
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [101],
    })

    const filterSql = String(query.mock.calls[1]?.[0])
    expect(filterSql).toContain(
      'FROM requirement_selection_answer_requirements AS answer_requirement',
    )
    expect(filterSql).toContain('AND EXISTS (')
    expect(filterSql).toContain('explicit_version.requirement_status_id = @1')
    expect(query.mock.calls[1]?.[1]).toEqual([4, STATUS_PUBLISHED])
  })

  it('returns no matched requirements without package or requirement filters', async () => {
    const db = createDb([])

    await expect(
      listRequirementSelectionMatchedRequirements(db),
    ).resolves.toEqual([])

    expect(vi.mocked(db.query)).not.toHaveBeenCalled()
  })

  it('matches published requirements from explicit requirement ids', async () => {
    const db = createDb([
      {
        description: 'Explicit requirement',
        id: 101,
        isDirect: 1,
        packageId: null,
        packageName: null,
        uniqueId: 'REQ-101',
      },
    ])

    await expect(
      listRequirementSelectionMatchedRequirements(db, {
        requirementIds: [101],
      }),
    ).resolves.toEqual([
      {
        description: 'Explicit requirement',
        direct: true,
        id: 101,
        sourcePackages: [],
        uniqueId: 'REQ-101',
      },
    ])

    const query = vi.mocked(db.query)
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'FROM requirements AS explicit_requirement',
    )
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'explicit_version.requirement_status_id = @1',
    )
    expect(String(query.mock.calls[0]?.[0])).not.toContain(
      'requirement_version_requirement_packages',
    )
    expect(query.mock.calls[0]?.[1]).toEqual([
      101,
      STATUS_PUBLISHED,
      STATUS_PUBLISHED,
    ])
  })

  it('matches published requirements from requirement packages', async () => {
    const db = createDb([
      {
        description: 'Packaged requirement',
        id: 202,
        isDirect: 0,
        packageId: 7,
        packageName: 'Baseline',
        uniqueId: 'REQ-202',
      },
    ])

    await expect(
      listRequirementSelectionMatchedRequirements(db, {
        packageIds: [7],
      }),
    ).resolves.toEqual([
      {
        description: 'Packaged requirement',
        direct: false,
        id: 202,
        sourcePackages: [{ id: 7, name: 'Baseline' }],
        uniqueId: 'REQ-202',
      },
    ])

    const query = vi.mocked(db.query)
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'FROM requirement_version_requirement_packages AS version_package',
    )
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'package_version.requirement_status_id = @1',
    )
    expect(query.mock.calls[0]?.[1]).toEqual([
      7,
      STATUS_PUBLISHED,
      STATUS_PUBLISHED,
    ])
  })

  it('matches overlapping package and requirement ids as one requirement with both sources', async () => {
    const db = createDb([
      {
        description: 'Mixed requirement',
        id: 303,
        isDirect: 1,
        packageId: null,
        packageName: null,
        uniqueId: 'REQ-303',
      },
      {
        description: 'Mixed requirement',
        id: 303,
        isDirect: 0,
        packageId: 9,
        packageName: 'Enhanced',
        uniqueId: 'REQ-303',
      },
    ])

    await expect(
      listRequirementSelectionMatchedRequirements(db, {
        packageIds: [9, 9],
        requirementIds: [303, 303],
      }),
    ).resolves.toEqual([
      {
        description: 'Mixed requirement',
        direct: true,
        id: 303,
        sourcePackages: [{ id: 9, name: 'Enhanced' }],
        uniqueId: 'REQ-303',
      },
    ])

    const query = vi.mocked(db.query)
    const sql = String(query.mock.calls[0]?.[0])
    expect(sql).toContain('UNION ALL')
    expect(sql).toContain('requirement_package.name AS packageName')
    expect(sql).toContain('ORDER BY requirement.unique_id ASC')
    expect(query.mock.calls[0]?.[1]).toEqual([
      303,
      STATUS_PUBLISHED,
      9,
      STATUS_PUBLISHED,
      STATUS_PUBLISHED,
    ])
  })

  it('rejects invalid matched requirement ids before querying', async () => {
    const db = createDb([])

    await expect(
      listRequirementSelectionMatchedRequirements(db, {
        packageIds: [0],
      }),
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        reason: 'invalid_id',
      }),
    })

    expect(vi.mocked(db.query)).not.toHaveBeenCalled()
  })

  it('cleans package links from requirement-selection answers and reports affected answers', async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => [
      { answerId: 7, requirementId: null },
      { answerId: 7, requirementId: null },
      { answerId: 9, requirementId: null },
    ])
    const db = { query } as unknown as Parameters<
      typeof cleanupRequirementSelectionPackageLinks
    >[0]

    await expect(
      cleanupRequirementSelectionPackageLinks(db, [3]),
    ).resolves.toEqual({
      affectedAnswerIds: [7, 9],
      affectedRequirementIds: [],
      removedLinkCount: 3,
    })

    expect(String(query.mock.calls[0]?.[0])).toContain('DELETE answer_package')
  })

  it('resolves visible question codes to database ids', async () => {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => [
      { id: 42 },
    ])
    const db = { query } as unknown as Parameters<
      typeof resolveRequirementSelectionQuestionId
    >[0]

    await expect(
      resolveRequirementSelectionQuestionId(db, 'SÄK-KUF001'),
    ).resolves.toBe(42)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('question_code = @0'),
      ['SÄK-KUF001'],
    )
  })

  it('sets and clears question archived_at when changing question state', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => [])
    const db = createTransactionalDb(query)

    await setRequirementSelectionQuestionState(db, 7, 'archive')
    await setRequirementSelectionQuestionState(db, 7, 'deactivate')

    const updateCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('UPDATE requirement_selection_questions'),
    )
    expect(String(updateCalls[0]?.[0])).toContain('archived_at = @2')
    expect(updateCalls[0]?.[1]).toEqual([
      0,
      1,
      expect.any(Date),
      expect.any(Date),
      7,
    ])
    expect(updateCalls[1]?.[1]).toEqual([0, 0, null, expect.any(Date), 7])
  })

  it('sets and clears answer archived_at when changing answer state', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('remainingActiveAnswerCount')) {
        return [{ questionIsActive: 0, remainingActiveAnswerCount: 0 }]
      }
      return []
    })
    const db = createTransactionalDb(query) as unknown as Parameters<
      typeof setRequirementSelectionAnswerState
    >[0]

    await setRequirementSelectionAnswerState(db, 7, 11, 'archive')
    await setRequirementSelectionAnswerState(db, 7, 11, 'reactivate')

    const updateCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('UPDATE requirement_selection_answers'),
    )
    expect(String(updateCalls[0]?.[0])).toContain('archived_at = @2')
    expect(updateCalls[0]?.[1]).toEqual([
      0,
      1,
      expect.any(Date),
      expect.any(Date),
      11,
      7,
    ])
    expect(updateCalls[1]?.[1]).toEqual([1, 0, null, expect.any(Date), 11, 7])
  })
})
