import { describe, expect, it, vi } from 'vitest'
import {
  archiveRequirementPackage,
  countLinkedRequirementsByPackage,
  createRequirementPackage,
  getLinkedRequirementsForPackage,
  getRequirementPackageById,
  getRequirementPackageUsage,
  listRequirementPackageCoAuthors,
  listRequirementPackages,
  reactivateRequirementPackage,
  replaceRequirementPackageCoAuthors,
  resolveSpecificationRequirementPackages,
  updateRequirementPackage,
} from '@/lib/dal/requirement-packages'

const basePackage = {
  coAuthorCreatedAt: null,
  coAuthorEmail: null,
  coAuthorGivenName: null,
  coAuthorHsaId: null,
  coAuthorMiddleName: null,
  coAuthorSurname: null,
  createdAt: new Date('2026-08-01T08:00:00.000Z'),
  id: 8,
  isArchived: 0,
  leadEmail: null,
  leadGivenName: null,
  leadHsaId: 'SE5560000001-lead',
  leadMiddleName: null,
  leadSurname: null,
  name: 'Package',
  purposeAndScope: 'Scope',
  updatedAt: new Date('2026-08-02T08:00:00.000Z'),
}

describe('requirement-package DAL coverage', () => {
  it('maps standalone co-authors with names and timestamps', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        createdAt: new Date('2026-08-01T08:00:00.000Z'),
        email: 'author@example.test',
        givenName: 'Anna',
        hsaId: 'SE5560000001-author',
        middleName: null,
        surname: 'Author',
      },
    ])
    const db = { query } as unknown as Parameters<
      typeof listRequirementPackageCoAuthors
    >[0]
    await expect(listRequirementPackageCoAuthors(db, 8)).resolves.toEqual([
      expect.objectContaining({
        createdAt: '2026-08-01T08:00:00.000Z',
        displayName: expect.stringContaining('Anna'),
        email: 'author@example.test',
      }),
    ])
  })

  it('maps lead fallback details and filters selected package IDs', async () => {
    const query = vi.fn().mockResolvedValue([basePackage])
    const db = { query } as unknown as Parameters<
      typeof listRequirementPackages
    >[0]
    await expect(
      listRequirementPackages(db, {
        includeIds: [8, 8, -1, 2.5],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        leadDisplayName: 'SE5560000001-lead',
        leadEmail: null,
      }),
    ])
    expect(query.mock.calls[0]?.[1]).toEqual([0, 8])
  })

  it('counts linked published requirements', async () => {
    const query = vi.fn().mockResolvedValue([
      { count: 3, requirementPackageId: 8 },
      { count: 1, requirementPackageId: 9 },
    ])
    const db = { query } as unknown as Parameters<
      typeof countLinkedRequirementsByPackage
    >[0]
    await expect(countLinkedRequirementsByPackage(db)).resolves.toEqual({
      8: 3,
      9: 1,
    })
  })

  it('maps present and missing package details', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([basePackage])
      .mockResolvedValueOnce([])
    const db = { query } as unknown as Parameters<
      typeof getRequirementPackageById
    >[0]
    await expect(getRequirementPackageById(db, 8)).resolves.toMatchObject({
      id: 8,
    })
    await expect(getRequirementPackageById(db, 404)).resolves.toBeNull()
  })

  it('maps linked archive timestamps and null values', async () => {
    const query = vi.fn().mockResolvedValue([
      {
        archiveInitiatedAt: new Date('2026-08-03T08:00:00.000Z'),
        description: null,
        id: 1,
        statusColor: null,
        statusIconName: null,
        statusId: 3,
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        uniqueId: 'REQ-1',
        versionNumber: 1,
      },
      {
        archiveInitiatedAt: null,
        description: null,
        id: 2,
        statusColor: null,
        statusIconName: null,
        statusId: 3,
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        uniqueId: 'REQ-2',
        versionNumber: 1,
      },
    ])
    const db = { query } as unknown as Parameters<
      typeof getLinkedRequirementsForPackage
    >[0]
    const result = await getLinkedRequirementsForPackage(db, 8)
    expect(result.map(row => row.archiveInitiatedAt)).toEqual([
      '2026-08-03T08:00:00.000Z',
      null,
    ])
  })

  it('returns usage values and stable zero defaults', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { answerLinkCount: '2', libraryRequirementCount: 4 },
      ])
      .mockResolvedValueOnce([])
    const db = { query } as unknown as Parameters<
      typeof getRequirementPackageUsage
    >[0]
    await expect(getRequirementPackageUsage(db, 8)).resolves.toEqual({
      answerLinkCount: 2,
      libraryRequirementCount: 4,
    })
    await expect(getRequirementPackageUsage(db, 404)).resolves.toEqual({
      answerLinkCount: 0,
      libraryRequirementCount: 0,
    })
  })

  it('reactivates present packages and returns undefined for missing packages', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...basePackage, isArchived: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const db = { query } as unknown as Parameters<
      typeof reactivateRequirementPackage
    >[0]
    await expect(reactivateRequirementPackage(db, 8)).resolves.toMatchObject({
      id: 8,
      isArchived: false,
    })
    await expect(reactivateRequirementPackage(db, 404)).resolves.toBeUndefined()
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(0)
  })

  it('archives in a transaction and returns cleanup metadata', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...basePackage, isArchived: 1 }])
    const manager = { query }
    const transaction = vi.fn(
      async (callback: (value: typeof manager) => unknown) => callback(manager),
    )
    const db = { transaction } as unknown as Parameters<
      typeof archiveRequirementPackage
    >[0]
    await expect(archiveRequirementPackage(db, 8)).resolves.toMatchObject({
      cleanup: { removedLinkCount: 0 },
      requirementPackage: { id: 8, isArchived: true },
    })
    expect(query.mock.calls[1]?.[1]?.[0]).toBe(1)
  })

  it('short-circuits empty package resolution', async () => {
    const query = vi.fn()
    const db = { query } as unknown as Parameters<
      typeof resolveSpecificationRequirementPackages
    >[0]
    await expect(
      resolveSpecificationRequirementPackages(db, 4, []),
    ).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  it('creates with responsibility people in new and existing transactions and maps insert fallback', async () => {
    const inserted = {
      createdAt: new Date('2026-08-01T08:00:00.000Z'),
      id: 8,
      isArchived: 0,
      leadHsaId: 'SE5560000001-lead',
      name: 'Package',
      purposeAndScope: 'Scope',
      updatedAt: new Date('2026-08-01T08:00:00.000Z'),
    }
    const query = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([inserted])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    const manager = { query }
    const transaction = vi.fn(
      async (callback: (value: typeof manager) => unknown) => callback(manager),
    )
    const db = { query, transaction } as unknown as Parameters<
      typeof createRequirementPackage
    >[0]
    const data = {
      leadHsaId: 'SE5560000001-lead',
      leadPerson: {
        email: 'lead@example.test',
        givenName: 'Lead',
        hsaId: 'SE5560000001-lead',
        middleName: null,
        surname: 'Person',
      },
      name: 'Package',
      purposeAndScope: 'Scope',
    }
    await expect(createRequirementPackage(db, data)).resolves.toMatchObject({
      leadDisplayName: expect.stringContaining('Lead'),
    })
    expect(transaction).toHaveBeenCalledOnce()

    query.mockReset()
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([inserted])
      .mockResolvedValueOnce([])
    await expect(
      createRequirementPackage(db, data, { useExistingTransaction: true }),
    ).resolves.toMatchObject({ id: 8 })
    expect(transaction).toHaveBeenCalledOnce()
  })

  it('updates with only a lead person and handles missing locked packages', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ leadHsaId: 'SE5560000001-lead' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([basePackage])
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
      typeof updateRequirementPackage
    >[0]
    await expect(
      updateRequirementPackage(db, 8, {
        leadPerson: {
          email: 'lead@example.test',
          givenName: 'Lead',
          hsaId: 'SE5560000001-lead',
          middleName: null,
          surname: 'Person',
        },
        purposeAndScope: 'Updated scope',
      }),
    ).resolves.toMatchObject({ id: 8 })

    query.mockReset().mockResolvedValueOnce([])
    await expect(
      updateRequirementPackage(db, 404, { leadHsaId: 'SE5560000001-next' }),
    ).resolves.toBeUndefined()
  })

  it('returns undefined when replacing co-authors for a missing package', async () => {
    const query = vi.fn().mockResolvedValue([])
    const manager = { query }
    const transaction = vi.fn(
      async (
        _isolation: string,
        callback: (value: typeof manager) => unknown,
      ) => callback(manager),
    )
    const db = { transaction } as unknown as Parameters<
      typeof replaceRequirementPackageCoAuthors
    >[0]
    await expect(
      replaceRequirementPackageCoAuthors(db, 404, { coAuthorHsaIds: [] }),
    ).resolves.toBeUndefined()
  })
})
