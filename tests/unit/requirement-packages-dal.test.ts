import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRequirementPackage,
  deleteRequirementPackage,
  getLinkedRequirementsForPackage,
  updateRequirementPackage,
} from '@/lib/dal/requirement-packages'

function createSqlServerDb() {
  const query = vi.fn().mockResolvedValue([
    {
      createdAt: new Date('2026-05-02T08:00:00.000Z'),
      description: 'Krav för mobil åtkomst och responsiva flöden.',
      id: 13,
      isArchived: false,
      leadDisplayName: 'Anna Johansson',
      leadEmail: 'anna.johansson@example.test',
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
      leadHsaId: 'SE5560000001-annaj',
      name: 'Mobil användning',
    })

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('created_at'),
      expect.arrayContaining([
        'Mobil användning',
        'Krav för mobil åtkomst och responsiva flöden.',
        'SE5560000001-annaj',
        expect.any(Date),
      ]),
    )
    expect(query.mock.calls[0][0]).toContain('updated_at')
    expect(query.mock.calls[0][0]).toContain('VALUES (@0, @1, @2, 0, @3, @3)')
    expect(result).toMatchObject({
      createdAt: '2026-05-02T08:00:00.000Z',
      id: 13,
      leadHsaId: 'SE5560000001-annaj',
      name: 'Mobil användning',
      updatedAt: '2026-05-02T08:00:00.000Z',
    })
  })

  it('returns only published linked requirements with normalized timestamps', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        archiveInitiatedAt: null,
        description: 'Published requirement',
        id: 1,
        statusColor: '#22c55e',
        statusId: 3,
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        uniqueId: 'REQ-1',
        versionNumber: 3,
      },
      {
        archiveInitiatedAt: null,
        description: 'Published requirement',
        id: 2,
        statusColor: '#22c55e',
        statusId: 3,
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
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
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'requirement_versions.requirement_status_id = 3',
    )
    expect(result).toMatchObject([
      {
        archiveInitiatedAt: null,
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
      .mockResolvedValueOnce([{ hsaId: 'SE5560000001-annaj' }])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ answerId: 7, requirementId: null }])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([])
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

    expect(String(query.mock.calls[1]?.[0])).toContain('NOT EXISTS')
    expect(String(query.mock.calls[2]?.[0])).toContain('DELETE answer_package')
    expect(String(query.mock.calls[3]?.[0])).toContain(
      'DELETE FROM requirement_packages',
    )
  })

  it('does not clean answer links when package deletion is blocked by real usage', async () => {
    const query = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])
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

    expect(query).toHaveBeenCalledTimes(2)
    expect(String(query.mock.calls[1]?.[0])).toContain(
      'requirement_version_requirement_packages',
    )
  })

  it('syncs package co-authors and cleans removed responsibility people on update', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ leadHsaId: 'SE5560000001-lead1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ hsaId: 'SE5560000001-old1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2026-05-02T08:00:00.000Z'),
          description: 'Updated package',
          id: 13,
          isArchived: false,
          leadEmail: 'lena.lead@example.test',
          leadGivenName: 'Lena',
          leadHsaId: 'SE5560000001-lead1',
          leadMiddleName: null,
          leadSurname: 'Lead',
          name: 'Updated',
          updatedAt: new Date('2026-05-02T08:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2026-05-02T08:05:00.000Z'),
          email: 'new@example.test',
          givenName: 'Nora',
          hsaId: 'SE5560000001-new1',
          middleName: null,
          requirementPackageId: 13,
          surname: 'New',
        },
      ])
      .mockResolvedValueOnce([])
    const manager = { query }
    const db = {
      transaction: vi.fn(async callback => callback(manager)),
    } as unknown as Parameters<typeof updateRequirementPackage>[0]

    const result = await updateRequirementPackage(db, 13, {
      changedBy: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
      },
      coAuthorHsaIds: [' SE5560000001-new1 ', ' ', 'SE5560000001-new1'],
      coAuthorPeople: [
        {
          email: 'new@example.test',
          givenName: 'Nora',
          hsaId: 'SE5560000001-new1',
          middleName: null,
          surname: 'New',
        },
      ],
      name: 'Updated',
    })

    expect(result).toMatchObject({
      coAuthors: [
        {
          displayName: 'Nora New',
          hsaId: 'SE5560000001-new1',
        },
      ],
      id: 13,
      leadDisplayName: 'Lena Lead',
      leadEmail: 'lena.lead@example.test',
    })
    expect(String(query.mock.calls[3]?.[0])).toContain(
      'DELETE FROM requirement_package_co_authors',
    )
    expect(String(query.mock.calls[4]?.[0])).toContain(
      'INSERT INTO requirement_package_co_authors',
    )
    expect(String(query.mock.calls[8]?.[0])).toContain('DELETE person')
  })
})
