import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countDeviationsPerItemRef,
  createDeviation,
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  deleteDeviation,
  deleteSpecificationLocalDeviation,
  listDeviationsForSpecification,
  listDeviationsForSpecificationItem,
  recordDecision,
  recordSpecificationLocalDecision,
  requestReview,
  updateDeviation,
  updateSpecificationLocalDeviation,
} from '@/lib/dal/deviations'

function createSqlServerDb() {
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const getRepository = vi.fn()
  const db = {
    getRepository,
    query,
  } as unknown as Parameters<typeof listDeviationsForSpecificationItem>[0]

  return { db, getRepository, query }
}

function compactSql(sql: unknown): string {
  return String(sql).replace(/\s+/g, ' ').trim()
}

describe('deviations DAL (SQL Server path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists specification-item deviations and normalizes SQL Server row values', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValue([
      {
        id: 7,
        specificationItemId: 3,
        motivation: 'Needs waiver',
        isReviewRequested: true,
        decision: null,
        decisionMotivation: null,
        decidedBy: null,
        decidedByHsaId: null,
        decidedAt: null,
        createdBy: 'reviewer',
        createdByHsaId: 'SE5560000001-reviewer1',
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
        updatedAt: new Date('2026-04-20T11:00:00.000Z'),
        requirementUniqueId: 'REQ-001',
        requirementDescription: 'Example requirement',
        requirementVersionId: 11,
        specificationName: 'Specification A',
        specificationUniqueId: 'PKG-001',
        isSpecificationLocal: 0,
        specificationLocalRequirementId: null,
      },
    ])

    const result = await listDeviationsForSpecificationItem(db, 3)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM deviations deviation'),
      [3],
    )
    expect(query.mock.calls[0][0]).toContain(
      'deviation.created_by_hsa_id AS createdByHsaId',
    )
    expect(query.mock.calls[0][0]).toContain(
      'deviation.decided_by_hsa_id AS decidedByHsaId',
    )
    expect(result).toEqual([
      {
        id: 7,
        specificationItemId: 3,
        specificationLocalRequirementId: null,
        motivation: 'Needs waiver',
        isReviewRequested: 1,
        decision: null,
        decisionMotivation: null,
        decidedBy: null,
        decidedByHsaId: null,
        decidedAt: null,
        createdBy: 'reviewer',
        createdByHsaId: 'SE5560000001-reviewer1',
        createdAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T11:00:00.000Z',
        requirementUniqueId: 'REQ-001',
        requirementDescription: 'Example requirement',
        requirementVersionId: 11,
        specificationName: 'Specification A',
        specificationUniqueId: 'PKG-001',
        isSpecificationLocal: false,
        itemRef: 'lib:3',
      },
    ])
  })

  it('creates a deviation after validating requirement application existence', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 3 }]).mockResolvedValueOnce([{ id: 42 }])

    const result = await createDeviation(db, {
      specificationItemId: 3,
      motivation: '  Legacy exception  ',
      createdBy: 'tester',
      createdByHsaId: 'SE5560000001-tester1',
    })

    expect(result).toEqual({ id: 42 })
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO deviations'),
      [
        3,
        'Legacy exception',
        'tester',
        'SE5560000001-tester1',
        expect.any(Date),
      ],
    )
  })

  it('lists both library and specification-local deviations for a specification', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValue([
      {
        id: 2,
        specificationItemId: null,
        motivation: 'Local deviation',
        isReviewRequested: 1,
        decision: null,
        decisionMotivation: null,
        decidedBy: null,
        decidedAt: null,
        createdBy: 'alice',
        createdAt: new Date('2026-04-20T09:00:00.000Z'),
        updatedAt: null,
        requirementUniqueId: 'PKG-L-001',
        requirementDescription: 'Local requirement',
        requirementVersionId: null,
        specificationName: 'Specification A',
        specificationUniqueId: 'PKG-001',
        isSpecificationLocal: 1,
        specificationLocalRequirementId: 9,
      },
      {
        id: 3,
        specificationItemId: 4,
        motivation: 'Library deviation',
        isReviewRequested: 0,
        decision: null,
        decisionMotivation: null,
        decidedBy: null,
        decidedAt: null,
        createdBy: 'bob',
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
        updatedAt: null,
        requirementUniqueId: 'REQ-001',
        requirementDescription: 'Library requirement',
        requirementVersionId: 6,
        specificationName: 'Specification A',
        specificationUniqueId: 'PKG-001',
        isSpecificationLocal: 0,
        specificationLocalRequirementId: null,
      },
    ])

    const result = await listDeviationsForSpecification(db, 1)

    expect(result).toHaveLength(2)
    expect(result[0].itemRef).toBe('local:9')
    expect(result[0].isSpecificationLocal).toBe(true)
    expect(result[1].itemRef).toBe('lib:4')
    expect(result[1].isSpecificationLocal).toBe(false)
  })

  it('requests review using an OUTPUT-based SQL Server update', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 8 }])

    await requestReview(db, 8)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('OUTPUT INSERTED.id AS id'),
      [expect.any(Date), 8],
    )
  })

  it('counts deviations per itemRef across library and specification-local items', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValue([
      {
        itemId: 4,
        isSpecificationLocal: 0,
        total: 2,
        pending: 1,
        approved: 1,
      },
      {
        itemId: 9,
        isSpecificationLocal: 1,
        total: 1,
        pending: 1,
        approved: 0,
      },
    ])

    const result = await countDeviationsPerItemRef(db, 1)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UNION ALL'),
      [1, 1],
    )
    expect(result).toEqual(
      new Map([
        ['lib:4', { total: 2, pending: 1, approved: 1 }],
        ['local:9', { total: 1, pending: 1, approved: 0 }],
      ]),
    )
  })

  it('updates library deviations using an atomic draft-only guard', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ decision: null, id: 7, isReviewRequested: 0 }])
      .mockResolvedValueOnce([{ id: 7 }])

    await updateDeviation(db, 7, {
      createdBy: 'editor',
      createdByHsaId: 'SE5560000001-editor1',
      motivation: '  Updated motivation  ',
    })

    const mutationSql = compactSql(query.mock.calls[1][0])
    expect(mutationSql).toContain('UPDATE deviations')
    expect(mutationSql).toContain('OUTPUT INSERTED.id AS id')
    expect(mutationSql).toContain('AND decision IS NULL')
    expect(mutationSql).toContain('AND is_review_requested = 0')
    expect(query.mock.calls[1][1]).toEqual([
      'Updated motivation',
      'editor',
      'SE5560000001-editor1',
      expect.any(Date),
      7,
    ])
  })

  it('updates specification-local deviations using an atomic draft-only guard', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ decision: null, id: 9, isReviewRequested: 0 }])
      .mockResolvedValueOnce([{ id: 9 }])

    await updateSpecificationLocalDeviation(db, 9, {
      motivation: '  Updated local motivation  ',
    })

    const mutationSql = compactSql(query.mock.calls[1][0])
    expect(mutationSql).toContain(
      'UPDATE specification_local_requirement_deviations',
    )
    expect(mutationSql).toContain('OUTPUT INSERTED.id AS id')
    expect(mutationSql).toContain('AND decision IS NULL')
    expect(mutationSql).toContain('AND is_review_requested = 0')
    expect(query.mock.calls[1][1]).toEqual([
      'Updated local motivation',
      expect.any(Date),
      9,
    ])
  })

  it('records decisions using an atomic review-requested guard', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce([{ id: 9 }])

    await recordDecision(db, 7, {
      decidedBy: 'reviewer',
      decidedByHsaId: 'SE5560000001-reviewer1',
      decision: DEVIATION_APPROVED,
      decisionMotivation: '  Approved  ',
    })
    await recordSpecificationLocalDecision(db, 9, {
      decidedBy: 'local reviewer',
      decidedByHsaId: 'SE5560000001-reviewer2',
      decision: DEVIATION_REJECTED,
      decisionMotivation: '  Rejected  ',
    })

    const librarySql = compactSql(query.mock.calls[0][0])
    expect(librarySql).toContain('UPDATE deviations')
    expect(librarySql).toContain('OUTPUT INSERTED.id AS id')
    expect(librarySql).toContain('AND decision IS NULL')
    expect(librarySql).toContain('AND is_review_requested = 1')
    expect(query.mock.calls[0][1]).toEqual([
      DEVIATION_APPROVED,
      'Approved',
      'reviewer',
      'SE5560000001-reviewer1',
      expect.any(Date),
      7,
    ])

    const localSql = compactSql(query.mock.calls[1][0])
    expect(localSql).toContain(
      'UPDATE specification_local_requirement_deviations',
    )
    expect(localSql).toContain('OUTPUT INSERTED.id AS id')
    expect(localSql).toContain('AND decision IS NULL')
    expect(localSql).toContain('AND is_review_requested = 1')
    expect(query.mock.calls[1][1]).toEqual([
      DEVIATION_REJECTED,
      'Rejected',
      'local reviewer',
      'SE5560000001-reviewer2',
      expect.any(Date),
      9,
    ])
  })

  it('deletes deviations using atomic draft-only guards', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce([{ id: 9 }])

    await deleteDeviation(db, 7)
    await deleteSpecificationLocalDeviation(db, 9)

    const librarySql = compactSql(query.mock.calls[0][0])
    expect(librarySql).toContain('DELETE FROM deviations')
    expect(librarySql).toContain('OUTPUT DELETED.id AS id')
    expect(librarySql).toContain('AND decision IS NULL')
    expect(librarySql).toContain('AND is_review_requested = 0')
    expect(query.mock.calls[0][1]).toEqual([7])

    const localSql = compactSql(query.mock.calls[1][0])
    expect(localSql).toContain(
      'DELETE FROM specification_local_requirement_deviations',
    )
    expect(localSql).toContain('OUTPUT DELETED.id AS id')
    expect(localSql).toContain('AND decision IS NULL')
    expect(localSql).toContain('AND is_review_requested = 0')
    expect(query.mock.calls[1][1]).toEqual([9])
  })

  it('reports not found when a guarded delete affects no rows and fallback finds none', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])

    await expect(deleteDeviation(db, 7)).rejects.toMatchObject({
      code: 'not_found',
      message: 'Deviation 7 not found',
    })

    expect(compactSql(query.mock.calls[1][0])).toContain(
      'FROM deviations deviation',
    )
  })

  it('reports decided conflicts when a guarded decision update affects no rows', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ decision: 1, id: 7, isReviewRequested: 1 }])

    await expect(
      recordDecision(db, 7, {
        decidedBy: 'reviewer',
        decidedByHsaId: 'SE5560000001-reviewer1',
        decision: DEVIATION_REJECTED,
        decisionMotivation: 'Second decision',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'A decision has already been recorded for this deviation',
    })
  })

  it('reports review-state conflicts when a guarded delete affects no rows', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ decision: null, id: 7, isReviewRequested: 1 }])

    await expect(deleteDeviation(db, 7)).rejects.toMatchObject({
      code: 'conflict',
      message: 'Cannot delete a deviation that has been submitted for review',
    })
  })

  it('rejects stale edits when state changes after the initial update pre-check', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ decision: null, id: 7, isReviewRequested: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ decision: 1, id: 7, isReviewRequested: 1 }])

    await expect(
      updateDeviation(db, 7, {
        motivation: 'This update lost the race',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'Cannot edit a deviation after a decision has been recorded',
    })

    expect(query).toHaveBeenCalledTimes(3)
    expect(compactSql(query.mock.calls[1][0])).toContain('AND decision IS NULL')
  })
})
