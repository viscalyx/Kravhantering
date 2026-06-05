import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRequirementPackage,
  deleteRequirementPackage,
  getLinkedRequirementsForPackage,
} from '@/lib/dal/requirement-packages'

function createSqlServerDb() {
  const query = vi.fn().mockResolvedValue([
    {
      createdAt: new Date('2026-05-02T08:00:00.000Z'),
      description: 'Krav för mobil åtkomst och responsiva flöden.',
      id: 13,
      isArchived: false,
      leadDisplayName: 'Anna Johansson',
      leadHsaId: 'SE5560000001-annaj',
      name: 'Mobil användning',
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
      description: 'Krav för mobil åtkomst och responsiva flöden.',
      leadDisplayName: 'Anna Johansson',
      leadHsaId: 'SE5560000001-annaj',
      name: 'Mobil användning',
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('created_at'),
      expect.arrayContaining([
        'Mobil användning',
        'Krav för mobil åtkomst och responsiva flöden.',
        'SE5560000001-annaj',
        'Anna Johansson',
        expect.any(Date),
      ]),
    )
    expect(query.mock.calls[0][0]).toContain('updated_at')
    expect(query.mock.calls[0][0]).toContain(
      'VALUES (@0, @1, @2, @3, 0, @4, @4)',
    )
    expect(result).toMatchObject({
      createdAt: '2026-05-02T08:00:00.000Z',
      id: 13,
      leadHsaId: 'SE5560000001-annaj',
      name: 'Mobil användning',
      updatedAt: '2026-05-02T08:00:00.000Z',
    })
  })

  it('returns linked requirements with normalized archive review timestamps', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        archiveInitiatedAt: new Date('2026-05-15T09:30:00.000Z'),
        description: 'Archiving review requirement',
        id: 1,
        statusColor: '#f59e0b',
        statusId: 2,
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
        uniqueId: 'REQ-1',
        versionNumber: 3,
      },
      {
        archiveInitiatedAt: null,
        description: 'Ordinary review requirement',
        id: 2,
        statusColor: '#f59e0b',
        statusId: 2,
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
        uniqueId: 'REQ-2',
        versionNumber: 1,
      },
    ])
    const db = {
      query,
    } as unknown as Parameters<typeof getLinkedRequirementsForPackage>[0]

    const result = await getLinkedRequirementsForPackage(db, 7)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'requirement_versions.archive_initiated_at AS archiveInitiatedAt',
      ),
      [7],
    )
    expect(result).toMatchObject([
      {
        archiveInitiatedAt: '2026-05-15T09:30:00.000Z',
        uniqueId: 'REQ-1',
      },
      {
        archiveInitiatedAt: null,
        uniqueId: 'REQ-2',
      },
    ])
  })

  it('deletes otherwise unused packages after cleaning requirement-selection answer links', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ answerId: 7, requirementId: null }])
      .mockResolvedValueOnce([{ id: 5 }])
    const manager = { query }
    const db = {
      transaction: vi.fn(async callback => callback(manager)),
    } as unknown as Parameters<typeof deleteRequirementPackage>[0]

    await expect(deleteRequirementPackage(db, 5)).resolves.toEqual({
      cleanup: {
        affectedAnswerIds: [7],
        affectedRequirementIds: [],
        removedLinkCount: 1,
      },
      deletedCount: 1,
    })

    expect(String(query.mock.calls[0]?.[0])).toContain('NOT EXISTS')
    expect(String(query.mock.calls[1]?.[0])).toContain('DELETE answer_package')
    expect(String(query.mock.calls[2]?.[0])).toContain(
      'DELETE FROM requirement_packages',
    )
  })

  it('does not clean answer links when package deletion is blocked by real usage', async () => {
    const query = vi.fn().mockResolvedValueOnce([])
    const manager = { query }
    const db = {
      transaction: vi.fn(async callback => callback(manager)),
    } as unknown as Parameters<typeof deleteRequirementPackage>[0]

    await expect(deleteRequirementPackage(db, 5)).resolves.toEqual({
      cleanup: {
        affectedAnswerIds: [],
        affectedRequirementIds: [],
        removedLinkCount: 0,
      },
      deletedCount: 0,
    })

    expect(query).toHaveBeenCalledTimes(1)
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'requirement_version_requirement_packages',
    )
  })
})
