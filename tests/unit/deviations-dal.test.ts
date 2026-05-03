import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  countDeviationsPerItemRef,
  createDeviation,
  listDeviationsForSpecification,
  listDeviationsForSpecificationItem,
  requestReview,
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
        decidedAt: null,
        createdBy: 'reviewer',
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
        decidedAt: null,
        createdBy: 'reviewer',
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

  it('creates a deviation after validating specification item existence', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 3 }]).mockResolvedValueOnce([{ id: 42 }])

    const result = await createDeviation(db, {
      specificationItemId: 3,
      motivation: '  Legacy exception  ',
      createdBy: 'tester',
    })

    expect(result).toEqual({ id: 42 })
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO deviations'),
      [3, 'Legacy exception', 'tester', expect.any(Date)],
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
})
