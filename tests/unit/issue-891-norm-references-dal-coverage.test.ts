import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  archiveNormReference,
  countLinkedRequirements,
  createNormReference,
  getLinkedRequirements,
  getNormReferenceById,
  getNormReferenceByNormReferenceId,
  getNormReferenceUsage,
  listNormReferences,
  reactivateNormReference,
  updateNormReference,
} from '@/lib/dal/norm-references'

const now = new Date('2026-08-01T12:00:00.000Z')
const entityRow = {
  createdAt: now,
  id: 7,
  isArchived: false,
  issuer: 'ISO',
  name: 'Security',
  normReferenceId: 'ISO-27001',
  reference: 'ISO 27001:2022',
  type: 'Standard',
  updatedAt: now,
  uri: null,
  version: null,
}

function repositoryDb(overrides: Record<string, unknown> = {}) {
  const repository = {
    create: vi.fn((value: object) => ({ id: 7, ...value })),
    findOne: vi.fn().mockResolvedValue(entityRow),
    save: vi.fn((value: object) => Promise.resolve(value)),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  }
  return {
    db: {
      getRepository: vi.fn(() => repository),
      query: vi.fn(),
    } as unknown as Parameters<typeof getNormReferenceById>[0],
    repository,
  }
}

describe('Issue 891 norm-reference DAL coverage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('covers repository lookup presence and absence', async () => {
    const { db, repository } = repositoryDb()
    await expect(getNormReferenceById(db, 7)).resolves.toMatchObject({
      createdAt: now.toISOString(),
      id: 7,
    })
    repository.findOne.mockResolvedValueOnce(null)
    await expect(getNormReferenceById(db, 404)).resolves.toBeNull()
  })

  it('lists without archived inclusions and returns null for a missing stable ID', async () => {
    const query = vi.fn().mockResolvedValue([])
    const db = { query } as unknown as Parameters<typeof listNormReferences>[0]
    await expect(listNormReferences(db)).resolves.toEqual([])
    expect(query).toHaveBeenCalledWith(expect.any(String), [0])
    await expect(
      getNormReferenceByNormReferenceId(db, 'missing'),
    ).resolves.toBeNull()
  })

  it('counts all links or selected valid statuses', async () => {
    const query = vi.fn().mockResolvedValue([
      { count: 2, normReferenceId: 7 },
      { count: 1, normReferenceId: 8 },
    ])
    const db = { query } as unknown as Parameters<
      typeof countLinkedRequirements
    >[0]
    await expect(countLinkedRequirements(db)).resolves.toEqual({ 7: 2, 8: 1 })
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [])
    await expect(
      countLinkedRequirements(db, { statuses: [3, -1, 3.5] }),
    ).resolves.toEqual({ 7: 2, 8: 1 })
    expect(query.mock.calls[1]?.[0]).toContain('IN (@0)')
    expect(query.mock.calls[1]?.[1]).toEqual([3])
  })

  it('maps linked archive timestamps and usage counts with missing-row defaults', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          archiveInitiatedAt: now,
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
          statusId: null,
          statusNameEn: null,
          statusNameSv: null,
          uniqueId: 'REQ-2',
          versionNumber: 1,
        },
      ])
      .mockResolvedValueOnce([
        { libraryRequirementCount: '4', localRequirementCount: 2 },
      ])
      .mockResolvedValueOnce([])
    const db = { query } as unknown as Parameters<
      typeof getLinkedRequirements
    >[0]
    const linked = await getLinkedRequirements(db, 7)
    expect(linked.map(row => row.archiveInitiatedAt)).toEqual([
      now.toISOString(),
      null,
    ])
    await expect(getNormReferenceUsage(db, 7)).resolves.toEqual({
      libraryRequirementCount: 4,
      localRequirementCount: 2,
    })
    await expect(getNormReferenceUsage(db, 404)).resolves.toEqual({
      libraryRequirementCount: 0,
      localRequirementCount: 0,
    })
  })

  it('creates explicit IDs and generated natural IDs with collision suffixes', async () => {
    const { db, repository } = repositoryDb()
    await expect(
      createNormReference(db, {
        issuer: 'ISO',
        name: 'Security',
        normReferenceId: ' EXPLICIT ',
        reference: 'ISO 27001:2022',
        type: 'Standard',
      }),
    ).resolves.toMatchObject({ normReferenceId: 'EXPLICIT' })

    repository.findOne
      .mockResolvedValueOnce(entityRow)
      .mockResolvedValueOnce(null)
    await expect(
      createNormReference(db, {
        issuer: 'SFS',
        name: 'Law',
        reference: 'SFS 2018:218',
        type: 'Law',
        uri: 'https://example.test',
        version: '2018',
      }),
    ).resolves.toMatchObject({ normReferenceId: 'SFS-2018-218-2' })
  })

  it('generates normalized slug IDs and falls back to the next NR sequence', async () => {
    const { db, repository } = repositoryDb({
      findOne: vi.fn().mockResolvedValue(null),
    })
    await expect(
      createNormReference(db, {
        issuer: 'Issuer',
        name: 'Årlig teknisk vägledning med långt namn',
        reference: 'No natural identifier',
        type: 'Guideline',
      }),
    ).resolves.toMatchObject({ normReferenceId: 'ARLIG-TEKNISK-VAGLED' })

    ;(db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { normReferenceId: 'NR-002' },
      { normReferenceId: 'invalid' },
    ])
    await expect(
      createNormReference(db, {
        issuer: 'I',
        name: '?',
        reference: '?',
        type: 'Other',
      }),
    ).resolves.toMatchObject({ normReferenceId: 'NR-003' })
    expect(repository.save).toHaveBeenCalledTimes(2)
  })

  it('updates every optional field and returns undefined when the row disappears', async () => {
    const { db, repository } = repositoryDb()
    await expect(
      updateNormReference(db, 7, {
        issuer: 'EU',
        name: 'Updated',
        normReferenceId: 'EU-1',
        reference: 'EU 1',
        type: 'Directive',
        uri: 'https://example.test/eu',
        version: '2',
      }),
    ).resolves.toMatchObject({ id: 7 })
    expect(repository.update).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        issuer: 'EU',
        name: 'Updated',
        normReferenceId: 'EU-1',
        reference: 'EU 1',
        type: 'Directive',
        uri: 'https://example.test/eu',
        version: '2',
        updatedAt: expect.any(Date),
      }),
    )
    repository.findOne.mockResolvedValueOnce(null)
    await expect(updateNormReference(db, 404, {})).resolves.toBeUndefined()
  })

  it('archives, reactivates, and reports missing rows', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ ...entityRow, isArchived: 1 }])
      .mockResolvedValueOnce([{ ...entityRow, isArchived: 0 }])
      .mockResolvedValueOnce([])
    const db = { query } as unknown as Parameters<
      typeof archiveNormReference
    >[0]
    await expect(archiveNormReference(db, 7)).resolves.toMatchObject({
      isArchived: true,
    })
    await expect(reactivateNormReference(db, 7)).resolves.toMatchObject({
      isArchived: false,
    })
    await expect(archiveNormReference(db, 404)).resolves.toBeUndefined()
    expect(query.mock.calls.map(call => call[1]?.[0])).toEqual([1, 0, 1])
  })
})
