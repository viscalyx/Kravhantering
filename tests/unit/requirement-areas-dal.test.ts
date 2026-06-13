import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canAuthorArea,
  createArea,
  listAreasActorCanAuthor,
  replaceRequirementAreaCoAuthors,
  updateArea,
  updateAreaWithOwnerCheck,
} from '@/lib/dal/requirement-areas'

function createSqlServerDb() {
  const query = vi.fn().mockResolvedValue([
    {
      id: 11,
      prefix: 'KH',
      name: 'Kravhantering',
      description: 'Krav relaterade till kravhantering',
      ownerHsaId: 'SE5560000001-owner1',
      nextSequence: 1,
      createdAt: new Date('2026-05-02T08:00:00.000Z'),
      updatedAt: new Date('2026-05-02T08:00:00.000Z'),
    },
  ])
  const transaction = vi.fn(
    async (
      isolationOrCallback:
        | string
        | ((manager: { query: typeof query }) => Promise<unknown>),
      maybeCallback?: (manager: { query: typeof query }) => Promise<unknown>,
    ) => {
      const callback =
        typeof isolationOrCallback === 'function'
          ? isolationOrCallback
          : maybeCallback
      if (!callback) throw new Error('Missing transaction callback')
      return callback({ query })
    },
  )
  return {
    db: { query, transaction } as unknown as Parameters<typeof createArea>[0],
    query,
    transaction,
  }
}

describe('requirement-areas DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an area with the required timestamp columns', async () => {
    const { db, query } = createSqlServerDb()

    const result = await createArea(db, {
      prefix: 'KH',
      name: 'Kravhantering',
      description: 'Krav relaterade till kravhantering',
      ownerHsaId: 'SE5560000001-owner1',
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('created_at'),
      expect.arrayContaining([
        'KH',
        'Kravhantering',
        'Krav relaterade till kravhantering',
        'SE5560000001-owner1',
        expect.any(Date),
      ]),
    )
    expect(query.mock.calls[0][0]).toContain('updated_at')
    expect(query.mock.calls[0][0]).toContain('VALUES (@0, @1, @2, @3, @4, @4)')
    expect(result).toMatchObject({
      id: 11,
      prefix: 'KH',
      name: 'Kravhantering',
      createdAt: '2026-05-02T08:00:00.000Z',
      updatedAt: '2026-05-02T08:00:00.000Z',
    })
  })

  it('lists graduation target requirement areas by owner or requirement area co-author HSA-id', async () => {
    const { db, query } = createSqlServerDb()

    await listAreasActorCanAuthor(db, 'SE5560000001-owner1', false)

    expect(query.mock.calls[0][0]).toContain('area.owner_hsa_id = @0')
    expect(query.mock.calls[0][0]).toContain('requirement_area_co_authors')
    expect(query.mock.calls[0][0]).toContain('co_author.hsa_id = @0')
    expect(query.mock.calls[0][1]).toEqual(['SE5560000001-owner1'])
  })

  it('checks graduation target owner or co-author permission', async () => {
    const { db, query } = createSqlServerDb()

    await canAuthorArea(db, 11, 'SE5560000001-owner1', false)

    expect(query.mock.calls[0][0]).toContain('area.owner_hsa_id = @1')
    expect(query.mock.calls[0][0]).toContain('requirement_area_co_authors')
    expect(query.mock.calls[0][0]).toContain('co_author.hsa_id = @1')
    expect(query.mock.calls[0][1]).toEqual([11, 'SE5560000001-owner1'])
  })

  it('does not upsert a responsibility person when updating a missing area', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ ownerHsaId: 'SE5560000001-old1' }])
      .mockResolvedValueOnce([])
    const manager = { query }
    const db = {
      transaction: vi.fn(async callback => callback(manager)),
    } as unknown as Parameters<typeof updateArea>[0]

    await expect(
      updateArea(db, 99, {
        ownerHsaId: 'SE5560000001-new1',
        ownerPerson: {
          email: 'new.owner@example.test',
          givenName: 'New',
          hsaId: 'SE5560000001-new1',
          middleName: null,
          surname: 'Owner',
        },
      }),
    ).resolves.toBeUndefined()

    expect(query).toHaveBeenCalledTimes(2)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('MERGE INTO requirement_responsibility_people'),
      ),
    ).toBe(false)
  })

  it('checks owner and co-author exclusivity inside a locked transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ ownerHsaId: 'SE5560000001-old1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 11,
          prefix: 'KH',
          name: 'Kravhantering',
          description: 'Krav relaterade till kravhantering',
          ownerHsaId: 'SE5560000001-new1',
          nextSequence: 1,
          createdAt: new Date('2026-05-02T08:00:00.000Z'),
          updatedAt: new Date('2026-05-03T08:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([])
    const resolveOwnerPerson = vi.fn(async () => ({
      email: 'new.owner@example.test',
      givenName: 'New',
      hsaId: 'SE5560000001-new1',
      middleName: null,
      surname: 'Owner',
    }))

    const result = await updateAreaWithOwnerCheck(db, 11, {
      ownerHsaId: 'SE5560000001-new1',
      resolveOwnerPerson,
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(transaction.mock.calls[0]?.[0]).toBe('SERIALIZABLE')
    expect(query.mock.calls[0]?.[0]).toContain('WITH (UPDLOCK, HOLDLOCK)')
    expect(query.mock.calls[1]?.[0]).toContain('WITH (UPDLOCK, HOLDLOCK)')
    expect(query.mock.calls[1]?.[0]).toContain(
      'FROM requirement_area_co_authors',
    )
    expect(resolveOwnerPerson).toHaveBeenCalledWith(
      expect.objectContaining({ query }),
      'SE5560000001-new1',
    )
    expect(query.mock.calls[2]?.[0]).toContain(
      'MERGE INTO requirement_responsibility_people',
    )
    expect(query.mock.calls[3]?.[0]).toContain('UPDATE requirement_areas')
    expect(result).toMatchObject({
      id: 11,
      ownerHsaId: 'SE5560000001-new1',
    })
  })

  it('rejects owner changes to an existing co-author before resolving the owner person', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ ownerHsaId: 'SE5560000001-old1' }])
      .mockResolvedValueOnce([{ areaId: 11 }])
    const resolveOwnerPerson = vi.fn()

    await expect(
      updateAreaWithOwnerCheck(db, 11, {
        ownerHsaId: 'SE5560000001-coa1',
        resolveOwnerPerson,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'area_owner_cannot_be_co_author' },
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(resolveOwnerPerson).not.toHaveBeenCalled()
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE requirement_areas'),
      ),
    ).toBe(false)
  })

  it('rejects owner person records that do not match the requested owner HSA-id', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        { ownerHsaId: 'SE5560000001-old1', prefix: 'KH' },
      ])
      .mockResolvedValueOnce([])

    await expect(
      updateAreaWithOwnerCheck(db, 11, {
        ownerHsaId: 'SE5560000001-new1',
        ownerPerson: {
          email: 'other.owner@example.test',
          givenName: 'Other',
          hsaId: 'SE5560000001-other1',
          middleName: null,
          surname: 'Owner',
        },
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'owner_person_hsa_id_mismatch' },
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('MERGE INTO requirement_responsibility_people'),
      ),
    ).toBe(false)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE requirement_areas'),
      ),
    ).toBe(false)
  })

  it('rejects co-author people that do not match requested co-author HSA-ids', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValueOnce([{ ownerHsaId: 'SE5560000001-owner1' }])

    await expect(
      replaceRequirementAreaCoAuthors(db, 11, {
        coAuthorHsaIds: ['SE5560000001-coa1'],
        coAuthorPeople: [
          {
            email: 'other.coauthor@example.test',
            givenName: 'Other',
            hsaId: 'SE5560000001-other1',
            middleName: null,
            surname: 'Coauthor',
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'co_author_person_hsa_id_mismatch' },
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('MERGE INTO requirement_responsibility_people'),
      ),
    ).toBe(false)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO requirement_area_co_authors'),
      ),
    ).toBe(false)
  })

  it('allows prefix changes while the requirement area has no requirements', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        { ownerHsaId: 'SE5560000001-old1', prefix: 'KH' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 11,
          prefix: 'NY',
          name: 'Kravhantering',
          description: 'Krav relaterade till kravhantering',
          ownerHsaId: 'SE5560000001-old1',
          nextSequence: 1,
          createdAt: new Date('2026-05-02T08:00:00.000Z'),
          updatedAt: new Date('2026-05-03T08:00:00.000Z'),
        },
      ])

    const result = await updateAreaWithOwnerCheck(db, 11, { prefix: 'NY' })

    expect(transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.anything())
    expect(query.mock.calls[1]?.[0]).toContain('FROM requirements')
    expect(query.mock.calls[2]?.[0]).toContain('UPDATE requirement_areas')
    expect(query.mock.calls[2]?.[0]).toContain('prefix = @0')
    expect(result).toMatchObject({ id: 11, prefix: 'NY' })
  })

  it('rejects prefix changes after the requirement area has requirements', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        { ownerHsaId: 'SE5560000001-old1', prefix: 'KH' },
      ])
      .mockResolvedValueOnce([{ id: 99 }])

    await expect(
      updateAreaWithOwnerCheck(db, 11, { prefix: 'NY' }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        reason: 'requirement_area_prefix_locked',
        requirementAreaId: 11,
      },
      status: 409,
    })

    expect(transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.anything())
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE requirement_areas'),
      ),
    ).toBe(false)
  })
})
