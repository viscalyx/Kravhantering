import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createArea } from '@/lib/dal/requirement-areas'

function createSqlServerDb() {
  const query = vi.fn().mockResolvedValue([
    {
      id: 11,
      prefix: 'KH',
      name: 'Kravhantering',
      description: 'Krav relaterade till kravhantering',
      ownerId: 1,
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
      ownerId: 1,
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('created_at'),
      expect.arrayContaining([
        'KH',
        'Kravhantering',
        'Krav relaterade till kravhantering',
        1,
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
})
