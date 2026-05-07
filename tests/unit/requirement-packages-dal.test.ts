import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequirementPackage } from '@/lib/dal/requirement-packages'

function createSqlServerDb() {
  const query = vi.fn().mockResolvedValue([
    {
      createdAt: new Date('2026-05-02T08:00:00.000Z'),
      descriptionEn: 'Requirements for mobile access and responsive flows.',
      descriptionSv: 'Krav för mobil åtkomst och responsiva flöden.',
      id: 13,
      nameEn: 'Mobile use',
      nameSv: 'Mobil användning',
      ownerId: 1,
      updatedAt: new Date('2026-05-02T08:00:00.000Z'),
    },
  ])
  return {
    db: { query } as unknown as Parameters<typeof createRequirementPackage>[0],
    query,
  }
}

describe('requirement-packages DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a requirement package with the required timestamp columns', async () => {
    const { db, query } = createSqlServerDb()

    const result = await createRequirementPackage(db, {
      descriptionEn: 'Requirements for mobile access and responsive flows.',
      descriptionSv: 'Krav för mobil åtkomst och responsiva flöden.',
      nameEn: 'Mobile use',
      nameSv: 'Mobil användning',
      ownerId: 1,
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('created_at'),
      expect.arrayContaining([
        'Mobil användning',
        'Mobile use',
        'Krav för mobil åtkomst och responsiva flöden.',
        'Requirements for mobile access and responsive flows.',
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
      nameEn: 'Mobile use',
      nameSv: 'Mobil användning',
      updatedAt: '2026-05-02T08:00:00.000Z',
    })
  })
})
