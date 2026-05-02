import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScenario } from '@/lib/dal/usage-scenarios'

function createSqlServerDb() {
  const query = vi.fn().mockResolvedValue([
    {
      createdAt: new Date('2026-05-02T08:00:00.000Z'),
      descriptionEn: 'Scenario description',
      descriptionSv: 'Scenariobeskrivning',
      id: 13,
      nameEn: 'Scenario',
      nameSv: 'Scenario',
      ownerId: 1,
      updatedAt: new Date('2026-05-02T08:00:00.000Z'),
    },
  ])
  return {
    db: { query } as unknown as Parameters<typeof createScenario>[0],
    query,
  }
}

describe('usage-scenarios DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a scenario with the required timestamp columns', async () => {
    const { db, query } = createSqlServerDb()

    const result = await createScenario(db, {
      descriptionEn: 'Scenario description',
      descriptionSv: 'Scenariobeskrivning',
      nameEn: 'Scenario',
      nameSv: 'Scenario',
      ownerId: 1,
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('created_at'),
      expect.arrayContaining([
        'Scenario',
        'Scenario',
        'Scenariobeskrivning',
        'Scenario description',
        1,
        expect.any(Date),
      ]),
    )
    expect(query.mock.calls[0][0]).toContain('updated_at')
    expect(query.mock.calls[0][0]).toContain(
      'VALUES (@0, @1, @2, @3, @4, @5, @5)',
    )
    expect(result).toMatchObject({
      createdAt: '2026-05-02T08:00:00.000Z',
      id: 13,
      nameEn: 'Scenario',
      nameSv: 'Scenario',
      updatedAt: '2026-05-02T08:00:00.000Z',
    })
  })
})
