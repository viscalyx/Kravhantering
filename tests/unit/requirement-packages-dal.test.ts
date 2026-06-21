import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createRequirementPackage,
  deleteRequirementPackage,
  getLinkedRequirementsForPackage,
  replaceRequirementPackageCoAuthors,
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

  it('checks lead and co-author exclusivity inside a locked transaction', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ leadHsaId: 'SE5560000001-old1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2026-05-02T08:00:00.000Z'),
          description: 'Updated package',
          id: 13,
          isArchived: false,
          leadEmail: 'new.lead@example.test',
          leadGivenName: 'New',
          leadHsaId: 'SE5560000001-new1',
          leadMiddleName: null,
          leadSurname: 'Lead',
          name: 'Updated package',
          updatedAt: new Date('2026-05-03T08:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    type MockManager = { query: typeof query }
    const manager: MockManager = { query }
    const transaction = vi.fn(
      async (
        _isolation: unknown,
        callback: (manager: MockManager) => Promise<unknown> | unknown,
      ) => callback(manager),
    )
    const db = {
      transaction,
    } as unknown as Parameters<typeof updateRequirementPackage>[0]

    const result = await updateRequirementPackage(db, 13, {
      leadHsaId: 'SE5560000001-new1',
      leadPerson: {
        email: 'new.lead@example.test',
        givenName: 'New',
        hsaId: 'SE5560000001-new1',
        middleName: null,
        surname: 'Lead',
      },
    })

    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'FROM requirement_packages WITH (UPDLOCK, HOLDLOCK)',
    )
    expect(String(query.mock.calls[1]?.[0])).toContain(
      'FROM requirement_package_co_authors WITH (UPDLOCK, HOLDLOCK)',
    )
    expect(String(query.mock.calls[2]?.[0])).toContain(
      'MERGE INTO requirement_responsibility_people',
    )
    expect(String(query.mock.calls[3]?.[0])).toContain(
      'UPDATE requirement_packages',
    )
    expect(String(query.mock.calls[6]?.[0])).toContain('DELETE person')
    expect(result).toMatchObject({
      id: 13,
      leadHsaId: 'SE5560000001-new1',
    })
  })

  it('rejects lead changes to an existing package co-author before updating', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ leadHsaId: 'SE5560000001-old1' }])
      .mockResolvedValueOnce([{ requirementPackageId: 13 }])
    type MockManager = { query: typeof query }
    const manager: MockManager = { query }
    const transaction = vi.fn(
      async (
        _isolation: unknown,
        callback: (manager: MockManager) => Promise<unknown> | unknown,
      ) => callback(manager),
    )
    const db = {
      transaction,
    } as unknown as Parameters<typeof updateRequirementPackage>[0]

    await expect(
      updateRequirementPackage(db, 13, {
        leadHsaId: 'SE5560000001-coa1',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'package_lead_cannot_be_co_author' },
    })

    expect(transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE requirement_packages'),
      ),
    ).toBe(false)
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

  it('replaces package co-authors and cleans removed responsibility people', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ leadHsaId: 'SE5560000001-lead1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ hsaId: 'SE5560000001-old1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const manager = { query }
    const db = {
      transaction: vi.fn(async (_isolation, callback) => callback(manager)),
    } as unknown as Parameters<typeof replaceRequirementPackageCoAuthors>[0]

    const result = await replaceRequirementPackageCoAuthors(db, 13, {
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
    })

    expect(db.transaction).toHaveBeenCalledWith(
      'SERIALIZABLE',
      expect.any(Function),
    )
    expect(result).toEqual({
      coAuthorHsaIds: ['SE5560000001-new1'],
      requirementPackageId: 13,
    })
    expect(String(query.mock.calls[3]?.[0])).toContain(
      'DELETE FROM requirement_package_co_authors',
    )
    expect(String(query.mock.calls[4]?.[0])).toContain(
      'INSERT INTO requirement_package_co_authors',
    )
    expect(String(query.mock.calls[5]?.[0])).toContain('DELETE person')
  })

  it('rejects package co-author replacements that include the package lead', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ leadHsaId: 'SE5560000001-lead1' }])
    const manager = { query }
    const db = {
      transaction: vi.fn(async (_isolation, callback) => callback(manager)),
    } as unknown as Parameters<typeof replaceRequirementPackageCoAuthors>[0]

    await expect(
      replaceRequirementPackageCoAuthors(db, 13, {
        coAuthorHsaIds: ['SE5560000001-lead1'],
      }),
    ).rejects.toMatchObject({
      details: { reason: 'package_lead_cannot_be_co_author' },
    })
  })
})
