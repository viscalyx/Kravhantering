import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countDeviationsBySpecification,
  countDeviationsPerItem,
  countDeviationsPerItemRef,
  createDeviation,
  createDeviationForItemRef,
  createSpecificationLocalDeviation,
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  deleteDeviation,
  deleteSpecificationLocalDeviation,
  getDeviation,
  getSpecificationLocalDeviation,
  listDeviationsForSpecification,
  listDeviationsForSpecificationItem,
  listDeviationsForSpecificationLocalRequirement,
  recordDecision,
  recordSpecificationLocalDecision,
  requestReview,
  requestSpecificationLocalReview,
  revertSpecificationLocalToDraft,
  revertToDraft,
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
        specificationCode: 'PKG-001',
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
        specificationCode: 'PKG-001',
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
      motivation: '  Handled exception  ',
      createdBy: 'tester',
      createdByHsaId: 'SE5560000001-tester1',
    })

    expect(result).toEqual({ id: 42 })
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO deviations'),
      [
        3,
        'Handled exception',
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
        specificationCode: 'PKG-001',
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
        specificationCode: 'PKG-001',
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
        rejected: 0,
      },
      {
        itemId: 9,
        isSpecificationLocal: 1,
        total: 1,
        pending: 1,
        approved: 0,
        rejected: 0,
      },
    ])

    const result = await countDeviationsPerItemRef(db, 1)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UNION ALL'),
      [1, 1, 2],
    )
    expect(result).toEqual(
      new Map([
        ['lib:4', { total: 2, pending: 1, approved: 1, rejected: 0 }],
        ['local:9', { total: 1, pending: 1, approved: 0, rejected: 0 }],
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

  it('normalizes nullable, string, and malformed values returned by SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValue([
      {
        id: '12',
        specificationItemId: '4',
        motivation: null,
        isReviewRequested: 'not-a-number',
        decision: 'not-a-number',
        decisionMotivation: 123,
        decidedBy: 456,
        decidedByHsaId: 789,
        decidedAt: '2026-05-01T10:00:00.000Z',
        createdBy: null,
        createdByHsaId: null,
        createdAt: null,
        updatedAt: '2026-05-01T11:00:00.000Z',
        requirementUniqueId: null,
        requirementDescription: null,
        requirementVersionId: 'not-a-number',
        specificationName: null,
        specificationCode: null,
        isLocal: false,
      },
    ])

    await expect(listDeviationsForSpecificationItem(db, 4)).resolves.toEqual([
      expect.objectContaining({
        id: 12,
        itemRef: 'lib:4',
        motivation: '',
        isReviewRequested: 0,
        decision: null,
        decisionMotivation: '123',
        decidedBy: '456',
        decidedByHsaId: '789',
        decidedAt: '2026-05-01T10:00:00.000Z',
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '2026-05-01T11:00:00.000Z',
        requirementVersionId: null,
      }),
    ])
  })

  it.each([
    ['library', getDeviation, 'Deviation 44 not found'],
    [
      'specification-local',
      getSpecificationLocalDeviation,
      'Specification-local deviation 44 not found',
    ],
  ] as const)(
    'gets and rejects missing %s deviations',
    async (_, getter, message) => {
      const found = createSqlServerDb()
      found.query.mockResolvedValueOnce([
        {
          id: 44,
          specificationItemId: getter === getDeviation ? 6 : null,
          specificationLocalRequirementId:
            getter === getSpecificationLocalDeviation ? 8 : null,
          motivation: 'Observed',
          isReviewRequested: 0,
          createdAt: '2026-05-02T10:00:00.000Z',
          isSpecificationLocal:
            getter === getSpecificationLocalDeviation ? 1 : 0,
        },
      ])
      await expect(getter(found.db, 44)).resolves.toMatchObject({
        id: 44,
        motivation: 'Observed',
      })

      const missing = createSqlServerDb()
      missing.query.mockResolvedValueOnce([])
      await expect(getter(missing.db, 44)).rejects.toMatchObject({
        code: 'not_found',
        message,
      })
    },
  )

  it('lists deviations for a specification-local requirement', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 5,
        specificationLocalRequirementId: 9,
        motivation: 'Local exception',
        isReviewRequested: 0,
        createdAt: '2026-05-02T10:00:00.000Z',
        isSpecificationLocal: 1,
      },
    ])

    await expect(
      listDeviationsForSpecificationLocalRequirement(db, 9),
    ).resolves.toEqual([expect.objectContaining({ id: 5, itemRef: 'local:9' })])
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE deviation.specification_local_requirement_id = @0',
      ),
      [9],
    )
  })

  it.each([
    [
      'library',
      (db: Parameters<typeof createDeviation>[0]) =>
        createDeviation(db, { specificationItemId: 3, motivation: '   ' }),
    ],
    [
      'specification-local',
      (db: Parameters<typeof createDeviation>[0]) =>
        createSpecificationLocalDeviation(db, {
          specificationLocalRequirementId: 9,
          motivation: '   ',
        }),
    ],
  ] as const)(
    'rejects blank motivation before creating a %s deviation',
    async (_, create) => {
      const { db, query } = createSqlServerDb()
      await expect(create(db)).rejects.toMatchObject({
        code: 'validation',
        message: 'Motivation is required',
      })
      expect(query).not.toHaveBeenCalled()
    },
  )

  it('creates specification-local deviations and reports missing targets', async () => {
    const success = createSqlServerDb()
    success.query
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([{ id: '51' }])
    await expect(
      createSpecificationLocalDeviation(success.db, {
        specificationLocalRequirementId: 9,
        motivation: '  Local reason  ',
      }),
    ).resolves.toEqual({ id: 51 })
    expect(success.query.mock.calls[1][1]).toEqual([
      9,
      'Local reason',
      null,
      null,
      expect.any(Date),
    ])

    const missing = createSqlServerDb()
    missing.query.mockResolvedValueOnce([])
    await expect(
      createSpecificationLocalDeviation(missing.db, {
        specificationLocalRequirementId: 404,
        motivation: 'Local reason',
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'Specification-local requirement 404 not found',
    })
  })

  it('reports missing library targets and propagates insert failures', async () => {
    const missing = createSqlServerDb()
    missing.query.mockResolvedValueOnce([])
    await expect(
      createDeviation(missing.db, {
        specificationItemId: 404,
        motivation: 'Reason',
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'Requirement application 404 not found',
    })

    const failed = createSqlServerDb()
    failed.query
      .mockResolvedValueOnce([{ id: 3 }])
      .mockRejectedValueOnce(new Error('SQL insert failed'))
    await expect(
      createDeviation(failed.db, {
        specificationItemId: 3,
        motivation: 'Reason',
      }),
    ).rejects.toThrow('SQL insert failed')
  })

  it('routes valid item references and rejects malformed references', async () => {
    const library = createSqlServerDb()
    library.query
      .mockResolvedValueOnce([{ id: 3 }])
      .mockResolvedValueOnce([{ id: 31 }])
    await expect(
      createDeviationForItemRef(library.db, {
        itemRef: 'lib:3',
        motivation: 'Library reason',
      }),
    ).resolves.toEqual({ id: 31 })
    expect(compactSql(library.query.mock.calls[0][0])).toContain(
      'FROM requirements_specification_items specification_item',
    )

    const local = createSqlServerDb()
    local.query
      .mockResolvedValueOnce([{ id: 9 }])
      .mockResolvedValueOnce([{ id: 32 }])
    await expect(
      createDeviationForItemRef(local.db, {
        itemRef: 'local:9',
        motivation: 'Local reason',
      }),
    ).resolves.toEqual({ id: 32 })
    expect(compactSql(local.query.mock.calls[0][0])).toContain(
      'FROM specification_local_requirements requirement',
    )

    const invalid = createSqlServerDb()
    await expect(
      createDeviationForItemRef(invalid.db, {
        itemRef: 'bad:9',
        motivation: 'Reason',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { itemRef: 'bad:9' },
    })
  })

  it.each([
    ['library', updateDeviation],
    ['specification-local', updateSpecificationLocalDeviation],
  ] as const)(
    'rejects missing, decided, reviewed, and blank %s edits',
    async (_, update) => {
      for (const [state, expected] of [
        [null, { code: 'not_found' }],
        [
          { decision: 1, id: 7, isReviewRequested: 1 },
          {
            code: 'conflict',
            message:
              'Cannot edit a deviation after a decision has been recorded',
          },
        ],
        [
          { decision: null, id: 7, isReviewRequested: 1 },
          {
            code: 'conflict',
            message:
              'Cannot edit a deviation that has been submitted for review',
          },
        ],
      ] as const) {
        const current = createSqlServerDb()
        current.query.mockResolvedValueOnce(state ? [state] : [])
        await expect(
          update(current.db, 7, { motivation: 'Reason' }),
        ).rejects.toMatchObject(expected)
      }

      const blank = createSqlServerDb()
      blank.query.mockResolvedValueOnce([
        { decision: null, id: 7, isReviewRequested: 0 },
      ])
      await expect(
        update(blank.db, 7, { motivation: '   ' }),
      ).rejects.toMatchObject({
        code: 'validation',
        message: 'Motivation is required',
      })
    },
  )

  it.each([
    ['library', updateDeviation],
    ['specification-local', updateSpecificationLocalDeviation],
  ] as const)(
    'supports creator-only and touch-only %s draft updates',
    async (_, update) => {
      const creator = createSqlServerDb()
      creator.query
        .mockResolvedValueOnce([
          { decision: null, id: 7, isReviewRequested: 0 },
        ])
        .mockResolvedValueOnce([{ id: 7 }])
      await update(creator.db, 7, { createdBy: null, createdByHsaId: null })
      expect(creator.query.mock.calls[1][1]).toEqual([
        null,
        null,
        expect.any(Date),
        7,
      ])

      const touch = createSqlServerDb()
      touch.query
        .mockResolvedValueOnce([
          { decision: null, id: 7, isReviewRequested: 0 },
        ])
        .mockResolvedValueOnce([{ id: 7 }])
      await update(touch.db, 7, {})
      expect(touch.query.mock.calls[1][1]).toEqual([expect.any(Date), 7])
    },
  )

  it.each([recordDecision, recordSpecificationLocalDecision] as const)(
    'validates decision evidence before SQL',
    async record => {
      for (const [data, message] of [
        [
          {
            decision: 3,
            decisionMotivation: 'Reason',
            decidedBy: 'Reviewer',
            decidedByHsaId: 'hsa',
          },
          'Decision must be 1 (approved) or 2 (rejected)',
        ],
        [
          {
            decision: 1,
            decisionMotivation: '   ',
            decidedBy: 'Reviewer',
            decidedByHsaId: 'hsa',
          },
          'Decision motivation is required',
        ],
        [
          {
            decision: 1,
            decisionMotivation: 'Reason',
            decidedBy: '   ',
            decidedByHsaId: 'hsa',
          },
          'Decided by is required',
        ],
      ] as const) {
        const { db, query } = createSqlServerDb()
        await expect(record(db, 7, data)).rejects.toMatchObject({
          code: 'validation',
          message,
        })
        expect(query).not.toHaveBeenCalled()
      }
    },
  )

  it.each([
    ['library decision', recordDecision],
    ['local decision', recordSpecificationLocalDecision],
  ] as const)(
    'classifies a lost %s race while still reviewed',
    async (_, record) => {
      const { db, query } = createSqlServerDb()
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { decision: null, id: 7, isReviewRequested: 1 },
        ])
      await expect(
        record(db, 7, {
          decision: 1,
          decisionMotivation: 'Reason',
          decidedBy: 'Reviewer',
          decidedByHsaId: 'hsa',
        }),
      ).rejects.toMatchObject({
        code: 'conflict',
        message:
          'Cannot record a decision because the deviation changed before the update completed',
      })
    },
  )

  it('classifies draft decision attempts and decided deletes', async () => {
    const draft = createSqlServerDb()
    draft.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ decision: null, id: 7, isReviewRequested: 0 }])
    await expect(
      recordDecision(draft.db, 7, {
        decision: 1,
        decisionMotivation: 'Reason',
        decidedBy: 'Reviewer',
        decidedByHsaId: 'hsa',
      }),
    ).rejects.toMatchObject({
      message:
        'Can only approve or reject deviations that have been submitted for review',
    })

    const decided = createSqlServerDb()
    decided.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ decision: 2, id: 7, isReviewRequested: 1 }])
    await expect(
      deleteSpecificationLocalDeviation(decided.db, 7),
    ).rejects.toMatchObject({
      message: 'Cannot delete a deviation after a decision has been recorded',
    })
  })

  it('returns aggregate and per-library-item counts with SQL nulls normalized', async () => {
    const aggregate = createSqlServerDb()
    aggregate.query.mockResolvedValueOnce([
      { total: '3', pending: '1', approved: '1', rejected: '1' },
      { total: null, pending: 'bad', approved: 0, rejected: null },
    ])
    await expect(
      countDeviationsBySpecification(aggregate.db, 2),
    ).resolves.toEqual({
      total: 3,
      pending: 1,
      approved: 1,
      rejected: 1,
    })

    const perItem = createSqlServerDb()
    perItem.query.mockResolvedValueOnce([
      { specificationItemId: '8', total: '2', pending: null, approved: 'bad' },
    ])
    await expect(countDeviationsPerItem(perItem.db, 2)).resolves.toEqual(
      new Map([[8, { total: 2, pending: 0, approved: 0 }]]),
    )
  })

  it.each([
    ['library', requestReview, revertToDraft],
    [
      'specification-local',
      requestSpecificationLocalReview,
      revertSpecificationLocalToDraft,
    ],
  ] as const)(
    'covers review and return-to-draft outcomes for %s deviations',
    async (_, request, revert) => {
      const requested = createSqlServerDb()
      requested.query.mockResolvedValueOnce([{ id: 7 }])
      await expect(request(requested.db, 7)).resolves.toBeUndefined()

      const reverted = createSqlServerDb()
      reverted.query.mockResolvedValueOnce([{ id: 7 }])
      await expect(revert(reverted.db, 7)).resolves.toBeUndefined()

      for (const [operation, state, expected] of [
        [request, null, { code: 'not_found' }],
        [
          request,
          { decision: 1, id: 7, isReviewRequested: 1 },
          {
            code: 'conflict',
            message:
              'Cannot request review for a deviation that already has a decision',
          },
        ],
        [
          request,
          { decision: null, id: 7, isReviewRequested: 1 },
          {
            code: 'conflict',
            message: 'Review has already been requested for this deviation',
          },
        ],
        [revert, null, { code: 'not_found' }],
        [
          revert,
          { decision: 1, id: 7, isReviewRequested: 1 },
          {
            code: 'conflict',
            message: 'Cannot revert a deviation that already has a decision',
          },
        ],
        [
          revert,
          { decision: null, id: 7, isReviewRequested: 0 },
          { code: 'conflict', message: 'Deviation is already in draft state' },
        ],
      ] as const) {
        const current = createSqlServerDb()
        current.query
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(state ? [state] : [])
        await expect(operation(current.db, 7)).rejects.toMatchObject(expected)
      }
    },
  )
})
