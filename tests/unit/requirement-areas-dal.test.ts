import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canAuthorArea,
  createArea,
  listAreasActorCanAuthor,
  updateArea,
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
  return { db: { query } as unknown as Parameters<typeof createArea>[0], query }
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

  it('lists graduation target requirement areas by owner or requirement area co-author HSA-ID', async () => {
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
})
