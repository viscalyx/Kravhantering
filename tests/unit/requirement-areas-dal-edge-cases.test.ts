import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canAuthorAnyArea,
  canAuthorArea,
  canManageAreaCoAuthors,
  createArea,
  getAreaById,
  listAreaIdsActorCanAuthor,
  listAreas,
  listAreasActorCanAuthor,
  listRequirementAreaCoAuthors,
  listRequirementAreaStewardshipRows,
  replaceRequirementAreaCoAuthors,
  updateArea,
  updateAreaWithOwnerCheck,
} from '@/lib/dal/requirement-areas'

const areaRow = {
  createdAt: new Date('2026-08-01T08:00:00.000Z'),
  description: null,
  id: 4,
  name: 'Security',
  nextSequence: 2,
  ownerHsaId: 'SE5560000001-owner',
  prefix: 'SEC',
  updatedAt: new Date('2026-08-02T08:00:00.000Z'),
}

describe('requirement-area DAL coverage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists and maps all areas, including admin delegation and anonymous denial', async () => {
    const query = vi.fn().mockResolvedValue([areaRow])
    const db = { query } as unknown as Parameters<typeof listAreas>[0]
    await expect(listAreas(db)).resolves.toEqual([
      expect.objectContaining({
        createdAt: '2026-08-01T08:00:00.000Z',
        updatedAt: '2026-08-02T08:00:00.000Z',
      }),
    ])
    await expect(
      listAreasActorCanAuthor(db, 'actor', true),
    ).resolves.toHaveLength(1)
    await expect(listAreasActorCanAuthor(db, null, false)).resolves.toEqual([])
    await expect(
      listAreasActorCanAuthor(db, 'actor', false),
    ).resolves.toHaveLength(1)
  })

  it('normalizes author area IDs and covers every author/manage shortcut', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([{ id: 4 }, { id: '5' }, { id: 1.5 }])
    const db = { query } as unknown as Parameters<
      typeof listAreaIdsActorCanAuthor
    >[0]
    await expect(listAreaIdsActorCanAuthor(db, null)).resolves.toEqual([])
    await expect(listAreaIdsActorCanAuthor(db, 'actor')).resolves.toEqual([
      4, 5,
    ])

    await expect(canAuthorArea(db, 4, 'actor', true)).resolves.toBe(true)
    await expect(canAuthorArea(db, 4, null, false)).resolves.toBe(false)
    await expect(canAuthorArea(db, 4, 'actor', false)).resolves.toBe(true)
    query.mockResolvedValueOnce([])
    await expect(canAuthorArea(db, 404, 'actor', false)).resolves.toBe(false)

    await expect(canAuthorAnyArea(db, 'actor', true)).resolves.toBe(true)
    await expect(canAuthorAnyArea(db, null, false)).resolves.toBe(false)
    await expect(canAuthorAnyArea(db, 'actor', false)).resolves.toBe(true)
    query.mockResolvedValueOnce([])
    await expect(canAuthorAnyArea(db, 'nobody', false)).resolves.toBe(false)

    await expect(canManageAreaCoAuthors(db, 4, 'actor', true)).resolves.toBe(
      true,
    )
    await expect(canManageAreaCoAuthors(db, 4, null, false)).resolves.toBe(
      false,
    )
    await expect(canManageAreaCoAuthors(db, 4, 'actor', false)).resolves.toBe(
      true,
    )
    query.mockResolvedValueOnce([])
    await expect(canManageAreaCoAuthors(db, 404, 'actor', false)).resolves.toBe(
      false,
    )
  })

  it('maps co-author people with nullable display details', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        email: 'author@example.test',
        givenName: 'Anna',
        hsaId: 'SE5560000001-anna',
        middleName: 'Maria',
        surname: 'Andersson',
      },
      {
        email: null,
        givenName: null,
        hsaId: 'SE5560000001-unknown',
        middleName: null,
        surname: null,
      },
    ])
    const db = { query } as unknown as Parameters<
      typeof listRequirementAreaCoAuthors
    >[0]
    const result = await listRequirementAreaCoAuthors(db, 4)
    expect(result[0]).toMatchObject({
      displayName: expect.stringContaining('Anna'),
      email: 'author@example.test',
    })
    expect(result[1]).toEqual({
      displayName: null,
      email: null,
      hsaId: 'SE5560000001-unknown',
    })
  })

  it('lists area stewardship responsibility summaries in stable person-name order', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        ...areaRow,
        coAuthorGivenName: 'Anna',
        coAuthorHsaId: 'SE5560000001-anna',
        coAuthorMiddleName: null,
        coAuthorSurname: 'Andersson',
        ownerGivenName: 'Olle',
        ownerMiddleName: null,
        ownerSurname: 'Owner',
      },
      {
        ...areaRow,
        coAuthorGivenName: 'Zelda',
        coAuthorHsaId: 'SE5560000001-zelda',
        coAuthorMiddleName: null,
        coAuthorSurname: 'Öberg',
        ownerGivenName: 'Olle',
        ownerMiddleName: null,
        ownerSurname: 'Owner',
      },
      {
        ...areaRow,
        coAuthorGivenName: 'Zelda',
        coAuthorHsaId: 'SE5560000001-zelda',
        coAuthorMiddleName: null,
        coAuthorSurname: 'Öberg',
        ownerGivenName: 'Olle',
        ownerMiddleName: null,
        ownerSurname: 'Owner',
      },
      {
        ...areaRow,
        coAuthorGivenName: null,
        coAuthorHsaId: null,
        coAuthorMiddleName: null,
        coAuthorSurname: null,
        id: 5,
        name: 'No co-authors',
        ownerGivenName: null,
        ownerHsaId: 'SE5560000001-unknown',
        ownerMiddleName: null,
        ownerSurname: null,
      },
    ])
    const db = { query } as unknown as Parameters<
      typeof listRequirementAreaStewardshipRows
    >[0]

    await expect(listRequirementAreaStewardshipRows(db)).resolves.toEqual([
      {
        coAuthors: [
          {
            displayName: 'Anna Andersson',
            hsaId: 'SE5560000001-anna',
          },
          {
            displayName: 'Zelda Öberg',
            hsaId: 'SE5560000001-zelda',
          },
        ],
        description: null,
        id: 4,
        name: 'Security',
        ownerDisplayName: 'Olle Owner',
        ownerHsaId: 'SE5560000001-owner',
        prefix: 'SEC',
      },
      {
        coAuthors: [],
        description: null,
        id: 5,
        name: 'No co-authors',
        ownerDisplayName: 'SE5560000001-unknown',
        ownerHsaId: 'SE5560000001-unknown',
        prefix: 'SEC',
      },
    ])
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[0]).toMatch(
      /ORDER BY[\s\S]*area\.name ASC[\s\S]*co_author_person\.surname ASC[\s\S]*co_author_person\.given_name ASC[\s\S]*co_author\.hsa_id ASC/u,
    )
  })

  it('gets present and missing areas', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([areaRow])
      .mockResolvedValueOnce([])
    const db = { query } as unknown as Parameters<typeof getAreaById>[0]
    await expect(getAreaById(db, 4)).resolves.toMatchObject({ id: 4 })
    await expect(getAreaById(db, 404)).resolves.toBeNull()
  })

  it('creates with an owner person transaction and nullable description', async () => {
    const query = vi.fn().mockResolvedValue([areaRow])
    const manager = { query }
    const transaction = vi.fn(
      async (callback: (value: typeof manager) => unknown) => callback(manager),
    )
    const db = { query, transaction } as unknown as Parameters<
      typeof createArea
    >[0]
    await expect(
      createArea(db, {
        name: 'Security',
        ownerHsaId: 'SE5560000001-owner',
        ownerPerson: {
          email: 'owner@example.test',
          givenName: 'Owner',
          hsaId: 'SE5560000001-owner',
          middleName: null,
          surname: 'Person',
        },
        prefix: 'SEC',
      }),
    ).resolves.toMatchObject({ id: 4 })
    expect(transaction).toHaveBeenCalledOnce()
    expect(query.mock.calls.at(-1)?.[1]).toEqual([
      'SEC',
      'Security',
      null,
      'SE5560000001-owner',
      expect.any(Date),
    ])
  })

  it('updates every ordinary field directly and delegates no-owner/no-prefix checked updates', async () => {
    const query = vi.fn().mockResolvedValue([areaRow])
    const db = { query } as unknown as Parameters<typeof updateArea>[0]
    await expect(
      updateArea(db, 4, {
        description: 'Updated',
        name: 'Updated security',
        ownerHsaId: 'SE5560000001-next',
        prefix: 'NEW',
      }),
    ).resolves.toMatchObject({ id: 4 })
    const [sql, params] = query.mock.calls[0] ?? []
    expect(sql).toContain('name = @0')
    expect(sql).toContain('description = @1')
    expect(sql).toContain('prefix = @2')
    expect(sql).toContain('owner_hsa_id = @3')
    expect(params).toEqual([
      'Updated security',
      'Updated',
      'NEW',
      'SE5560000001-next',
      expect.any(Date),
      4,
    ])
    await expect(
      updateAreaWithOwnerCheck(db, 4, { name: 'Ordinary edit' }),
    ).resolves.toMatchObject({ id: 4 })
    query.mockResolvedValueOnce([])
    await expect(
      updateArea(db, 404, { name: 'Missing' }),
    ).resolves.toBeUndefined()
  })

  it('updates with owner-person persistence and cleans the former owner', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ ownerHsaId: 'SE5560000001-old' }])
      .mockResolvedValueOnce([areaRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const manager = { query }
    const transaction = vi.fn(
      async (callback: (value: typeof manager) => unknown) => callback(manager),
    )
    const db = { transaction } as unknown as Parameters<typeof updateArea>[0]
    await expect(
      updateArea(db, 4, {
        name: 'Owner edit',
        ownerPerson: {
          email: 'owner@example.test',
          givenName: 'Owner',
          hsaId: 'SE5560000001-owner',
          middleName: null,
          surname: 'Person',
        },
      }),
    ).resolves.toMatchObject({ id: 4 })
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('MERGE INTO')),
    ).toBe(true)
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('DELETE person')),
    ).toBe(true)
  })

  it('replaces changed co-authors, persists people, removes old rows, and handles missing areas', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ ownerHsaId: 'SE5560000001-owner' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ hsaId: 'SE5560000001-old' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const manager = { query }
    const transaction = vi.fn(
      async (
        _isolation: string,
        callback: (value: typeof manager) => unknown,
      ) => callback(manager),
    )
    const db = { transaction } as unknown as Parameters<
      typeof replaceRequirementAreaCoAuthors
    >[0]
    await expect(
      replaceRequirementAreaCoAuthors(db, 4, {
        changedBy: { displayName: 'Admin', hsaId: 'SE5560000001-admin' },
        coAuthorHsaIds: [' SE5560000001-new ', 'SE5560000001-new', ''],
        coAuthorPeople: [
          {
            email: 'new@example.test',
            givenName: 'New',
            hsaId: 'SE5560000001-new',
            middleName: null,
            surname: 'Author',
          },
        ],
      }),
    ).resolves.toEqual({
      areaId: 4,
      coAuthorHsaIds: ['SE5560000001-new'],
    })
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('DELETE FROM requirement_area_co_authors'),
      ),
    ).toBe(true)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO requirement_area_co_authors'),
      ),
    ).toBe(true)

    query.mockReset().mockResolvedValueOnce([])
    await expect(
      replaceRequirementAreaCoAuthors(db, 404, { coAuthorHsaIds: [] }),
    ).resolves.toBeUndefined()
  })
})
