import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveArchiving,
  cancelArchiving,
  editRequirement,
  getRequirementById,
  getRequirementByUniqueId,
  initiateArchiving,
} from '@/lib/dal/requirements'

function createSqlServerDb() {
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const getRepository = vi.fn()
  const transaction = vi.fn(
    async (
      isolationOrCallback:
        | string
        | ((manager: { query: typeof query }) => Promise<unknown>),
      maybeCallback?: (manager: { query: typeof query }) => Promise<unknown>,
    ) => {
      const callback =
        typeof isolationOrCallback === 'function'
          ? isolationOrCallback
          : maybeCallback
      if (!callback) throw new Error('Missing transaction callback')
      return callback({ query })
    },
  )
  const db = {
    getRepository,
    query,
    transaction,
  } as unknown as Parameters<typeof getRequirementById>[0]

  return { db, query, transaction }
}

describe('requirements DAL (SQL Server path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when the requirement does not exist', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await expect(getRequirementById(db, 42)).resolves.toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM requirements requirement'),
      [42],
    )
  })

  it('hydrates the requirement, area, versions, joins and specification count', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 7,
          uniqueId: 'SEC-0001',
          requirementAreaId: 3,
          sequenceNumber: 1,
          isArchived: 0,
          createdAt: new Date('2026-04-20T08:00:00.000Z'),
          areaId: 3,
          areaPrefix: 'SEC-',
          areaName: 'Security',
          areaDescription: null,
          areaOwnerId: 11,
          areaNextSequence: 2,
          areaCreatedAt: new Date('2026-04-19T08:00:00.000Z'),
          areaUpdatedAt: new Date('2026-04-19T09:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 21,
          revisionToken: '11111111-1111-4111-8111-111111111111',
          requirementId: 7,
          versionNumber: 2,
          description: 'desc-v2',
          acceptanceCriteria: 'ac-v2',
          requirementCategoryId: 4,
          requirementTypeId: 5,
          qualityCharacteristicId: 6,
          riskLevelId: 1,
          statusId: 3,
          requiresTesting: 1,
          verificationMethod: 'inspection',
          createdAt: new Date('2026-04-20T08:30:00.000Z'),
          editedAt: null,
          publishedAt: new Date('2026-04-20T09:00:00.000Z'),
          archivedAt: null,
          archiveInitiatedAt: null,
          createdBy: 'anna',
          categoryId: 4,
          categoryNameEn: 'Functional',
          categoryNameSv: 'Funktionell',
          typeId: 5,
          typeNameEn: 'Type EN',
          typeNameSv: 'Type SV',
          qcId: 6,
          qcNameEn: 'QC EN',
          qcNameSv: 'QC SV',
          qcRequirementTypeId: 5,
          qcParentId: null,
          rlId: 1,
          rlNameEn: 'High',
          rlNameSv: 'Hög',
          rlColor: '#ff0000',
          rlSortOrder: 10,
          statusRowId: 3,
          statusNameEn: 'Published',
          statusNameSv: 'Publicerad',
          statusColor: '#22c55e',
          statusSortOrder: 30,
          statusIsSystem: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          requirementVersionId: 21,
          normReferenceId: 100,
          nrId: 100,
          nrNormReferenceId: 'ISO-25010',
          nrName: 'ISO/IEC 25010',
          nrType: 'standard',
          nrReference: 'ISO 25010:2023',
          nrVersion: '2023',
          nrIssuer: 'ISO',
          nrUri: 'https://example.com',
          nrCreatedAt: new Date('2026-04-01T00:00:00.000Z'),
          nrUpdatedAt: new Date('2026-04-02T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          requirementVersionId: 21,
          usageScenarioId: 200,
          scId: 200,
          scNameEn: 'Citizen portal',
          scNameSv: 'Medborgarportal',
          scDescriptionEn: null,
          scDescriptionSv: null,
          scOwnerId: null,
          scCreatedAt: new Date('2026-03-01T00:00:00.000Z'),
          scUpdatedAt: new Date('2026-03-02T00:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ specificationCount: 2 }])

    const result = await getRequirementById(db, 7)

    expect(result).not.toBeNull()
    expect(result?.id).toBe(7)
    expect(result?.uniqueId).toBe('SEC-0001')
    expect(result?.isArchived).toBe(false)
    expect(result?.specificationCount).toBe(2)
    expect(result?.area).toEqual({
      id: 3,
      prefix: 'SEC-',
      name: 'Security',
      description: null,
      ownerId: 11,
      nextSequence: 2,
      createdAt: '2026-04-19T08:00:00.000Z',
      updatedAt: '2026-04-19T09:00:00.000Z',
    })
    expect(result?.versions).toHaveLength(1)
    const version = result?.versions[0]
    expect(version?.id).toBe(21)
    expect(version?.revisionToken).toBe('11111111-1111-4111-8111-111111111111')
    expect(version?.versionNumber).toBe(2)
    expect(version?.requiresTesting).toBe(true)
    expect(version?.status).toBe(3)
    expect(version?.statusNameEn).toBe('Published')
    expect(version?.statusNameSv).toBe('Publicerad')
    expect(version?.statusColor).toBe('#22c55e')
    expect(version?.category).toEqual({
      id: 4,
      nameEn: 'Functional',
      nameSv: 'Funktionell',
    })
    expect(version?.riskLevel).toEqual({
      id: 1,
      nameEn: 'High',
      nameSv: 'Hög',
      color: '#ff0000',
      sortOrder: 10,
    })
    expect(version?.versionNormReferences).toEqual([
      {
        normReferenceId: 100,
        requirementVersionId: 21,
        normReference: {
          id: 100,
          normReferenceId: 'ISO-25010',
          name: 'ISO/IEC 25010',
          type: 'standard',
          reference: 'ISO 25010:2023',
          version: '2023',
          issuer: 'ISO',
          uri: 'https://example.com',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      },
    ])
    expect(version?.versionScenarios).toEqual([
      {
        requirementVersionId: 21,
        usageScenarioId: 200,
        scenario: {
          id: 200,
          nameEn: 'Citizen portal',
          nameSv: 'Medborgarportal',
          descriptionEn: null,
          descriptionSv: null,
          ownerId: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
      },
    ])
  })

  it('resolves a requirement by unique id and delegates to getRequirementById', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 7 }]).mockResolvedValueOnce([])

    await expect(getRequirementByUniqueId(db, 'SEC-0001')).resolves.toBeNull()
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM requirements'),
      ['SEC-0001'],
    )
  })

  it('returns null when no requirement matches the unique id', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await expect(getRequirementByUniqueId(db, 'NONE')).resolves.toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('rejects a stale base version id before updating a draft', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 22,
        revisionToken: '11111111-1111-4111-8111-111111111111',
        statusId: 1,
      },
    ])

    await expect(
      editRequirement(db, 7, {
        baseRevisionToken: '11111111-1111-4111-8111-111111111111',
        baseVersionId: 21,
        description: 'Stale update',
        normReferenceIds: [100],
        scenarioIds: [200],
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        baseVersionId: 21,
        latestVersionId: 22,
        reason: 'stale_requirement_edit',
      },
    })

    const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls).toHaveLength(1)
    expect(sqlCalls[0]).toContain('WITH (UPDLOCK, HOLDLOCK)')
    expect(
      sqlCalls.some(sql =>
        sql.includes('DELETE FROM requirement_version_usage_scenarios'),
      ),
    ).toBe(false)
    expect(
      sqlCalls.some(sql =>
        sql.includes('DELETE FROM requirement_version_norm_references'),
      ),
    ).toBe(false)
  })

  it('rejects a stale base revision token before rewriting joins', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 21,
        revisionToken: '22222222-2222-4222-8222-222222222222',
        statusId: 1,
      },
    ])

    await expect(
      editRequirement(db, 7, {
        baseRevisionToken: '11111111-1111-4111-8111-111111111111',
        baseVersionId: 21,
        description: 'Stale update',
        normReferenceIds: [100],
        scenarioIds: [200],
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        baseVersionId: 21,
        latestVersionId: 21,
        reason: 'stale_requirement_edit',
      },
    })

    const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls).toHaveLength(1)
    expect(
      sqlCalls.some(sql =>
        sql.includes('DELETE FROM requirement_version_usage_scenarios'),
      ),
    ).toBe(false)
    expect(
      sqlCalls.some(sql =>
        sql.includes('DELETE FROM requirement_version_norm_references'),
      ),
    ).toBe(false)
  })

  it('returns a stale edit conflict before review status when the edit token is old', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 21,
        revisionToken: '22222222-2222-4222-8222-222222222222',
        statusId: 2,
      },
    ])

    await expect(
      editRequirement(db, 7, {
        baseRevisionToken: '11111111-1111-4111-8111-111111111111',
        baseVersionId: 21,
        description: 'Review edit with stale token',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        baseVersionId: 21,
        latestVersionId: 21,
        reason: 'stale_requirement_edit',
      },
    })

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('still rejects review edits after the edit token matches the latest version', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 21,
        revisionToken: '11111111-1111-4111-8111-111111111111',
        statusId: 2,
      },
    ])

    await expect(
      editRequirement(db, 7, {
        baseRevisionToken: '11111111-1111-4111-8111-111111111111',
        baseVersionId: 21,
        description: 'Illegal review edit',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'Cannot edit a requirement in Review status',
    })

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('rotates the revision token when updating a draft', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 21,
          revisionToken: '11111111-1111-4111-8111-111111111111',
          statusId: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: null,
          archiveInitiatedAt: null,
          archivedAt: null,
          createdAt: new Date('2026-04-20T08:30:00.000Z'),
          createdBy: 'anna',
          description: 'Updated draft',
          editedAt: new Date('2026-04-20T09:30:00.000Z'),
          id: 21,
          publishedAt: null,
          qualityCharacteristicId: null,
          requirementCategoryId: null,
          requirementId: 7,
          requirementTypeId: null,
          requiresTesting: 0,
          revisionToken: '22222222-2222-4222-8222-222222222222',
          riskLevelId: null,
          statusId: 1,
          verificationMethod: null,
          versionNumber: 2,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await editRequirement(db, 7, {
      baseRevisionToken: '11111111-1111-4111-8111-111111111111',
      baseVersionId: 21,
      description: 'Updated draft',
      normReferenceIds: [],
      scenarioIds: [],
    })

    const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls[1]).toContain('revision_token = NEWID()')
    expect(sqlCalls[1]).toContain(
      'revision_token = CONVERT(uniqueidentifier, @10)',
    )
    expect(result.revisionToken).toBe('22222222-2222-4222-8222-222222222222')
  })
})

describe('archiving helpers (atomicity & strict-target rule)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initiateArchiving', () => {
    it('runs all reads and writes inside a SERIALIZABLE transaction with locked precondition selects', async () => {
      const { db, query, transaction } = createSqlServerDb()
      query
        .mockResolvedValueOnce([{ id: 21, versionNumber: 1 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 21 }])

      await initiateArchiving(db, 7)

      expect(transaction).toHaveBeenCalledTimes(1)
      expect(transaction.mock.calls[0]?.[0]).toBe('SERIALIZABLE')
      const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
      expect(sqlCalls).toHaveLength(3)
      expect(sqlCalls[0]).toContain('WITH (UPDLOCK, HOLDLOCK)')
      expect(sqlCalls[0]).toContain('requirement_status_id = 3')
      expect(sqlCalls[1]).toContain('WITH (UPDLOCK, HOLDLOCK)')
      expect(sqlCalls[2]).toMatch(/UPDATE requirement_versions/)
      expect(sqlCalls[2]).toContain('requirement_status_id = 3')
      expect(sqlCalls[2]).toContain('archive_initiated_at IS NULL')
      expect(sqlCalls[2]).toContain('OUTPUT INSERTED.id')
    })

    it('throws conflict when no published version exists', async () => {
      const { db, query } = createSqlServerDb()
      query.mockResolvedValueOnce([])

      await expect(initiateArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message: 'No published version found to archive',
      })
    })

    it('throws conflict when a newer Draft or Review version exists', async () => {
      const { db, query } = createSqlServerDb()
      query
        .mockResolvedValueOnce([{ id: 21, versionNumber: 1 }])
        .mockResolvedValueOnce([{ id: 22 }])

      await expect(initiateArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message:
          'Cannot initiate archiving while there is a pending draft or review version',
      })
    })

    it('throws conflict when the conditional UPDATE affects zero rows', async () => {
      const { db, query } = createSqlServerDb()
      query
        .mockResolvedValueOnce([{ id: 21, versionNumber: 1 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await expect(initiateArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message: 'No published version found to archive',
      })
    })
  })

  describe('approveArchiving', () => {
    it('runs reads and writes inside a SERIALIZABLE transaction and targets the row with archive_initiated_at IS NOT NULL', async () => {
      const { db, query, transaction } = createSqlServerDb()
      query
        .mockResolvedValueOnce([{ id: 21, statusId: 2 }])
        .mockResolvedValueOnce([{ id: 21 }])
        .mockResolvedValueOnce([])

      await approveArchiving(db, 7)

      expect(transaction).toHaveBeenCalledTimes(1)
      expect(transaction.mock.calls[0]?.[0]).toBe('SERIALIZABLE')
      const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
      expect(sqlCalls).toHaveLength(3)
      expect(sqlCalls[0]).toContain('WITH (UPDLOCK, HOLDLOCK)')
      expect(sqlCalls[0]).toContain('archive_initiated_at IS NOT NULL')
      expect(sqlCalls[0]).not.toMatch(/ORDER BY version_number/)
      expect(sqlCalls[1]).toMatch(/UPDATE requirement_versions/)
      expect(sqlCalls[1]).toContain('requirement_status_id = 2')
      expect(sqlCalls[1]).toContain('archive_initiated_at IS NOT NULL')
      expect(sqlCalls[1]).toContain('OUTPUT INSERTED.id')
      expect(sqlCalls[2]).toMatch(/UPDATE requirements SET is_archived = 1/)
    })

    it('throws conflict when no version has archiving initiated', async () => {
      const { db, query } = createSqlServerDb()
      query.mockResolvedValueOnce([])

      await expect(approveArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message: 'No version with archiving initiated found',
      })
    })

    it('throws conflict when the targeted version is no longer in Review', async () => {
      const { db, query } = createSqlServerDb()
      query.mockResolvedValueOnce([{ id: 21, statusId: 1 }])

      await expect(approveArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message:
          'Can only approve archiving from Review status with archiving initiated',
      })
    })

    it('throws conflict when the conditional UPDATE affects zero rows', async () => {
      const { db, query } = createSqlServerDb()
      query
        .mockResolvedValueOnce([{ id: 21, statusId: 2 }])
        .mockResolvedValueOnce([])

      await expect(approveArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message: 'No version with archiving initiated found',
      })
    })
  })

  describe('cancelArchiving', () => {
    it('runs reads and writes inside a SERIALIZABLE transaction and targets the row with archive_initiated_at IS NOT NULL', async () => {
      const { db, query, transaction } = createSqlServerDb()
      query
        .mockResolvedValueOnce([{ id: 21, statusId: 2 }])
        .mockResolvedValueOnce([{ id: 21 }])

      await cancelArchiving(db, 7)

      expect(transaction).toHaveBeenCalledTimes(1)
      expect(transaction.mock.calls[0]?.[0]).toBe('SERIALIZABLE')
      const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
      expect(sqlCalls).toHaveLength(2)
      expect(sqlCalls[0]).toContain('WITH (UPDLOCK, HOLDLOCK)')
      expect(sqlCalls[0]).toContain('archive_initiated_at IS NOT NULL')
      expect(sqlCalls[0]).not.toMatch(/ORDER BY version_number/)
      expect(sqlCalls[1]).toMatch(/UPDATE requirement_versions/)
      expect(sqlCalls[1]).toContain('requirement_status_id = 2')
      expect(sqlCalls[1]).toContain('archive_initiated_at IS NOT NULL')
      expect(sqlCalls[1]).toContain('OUTPUT INSERTED.id')
    })

    it('throws conflict when no version has archiving initiated', async () => {
      const { db, query } = createSqlServerDb()
      query.mockResolvedValueOnce([])

      await expect(cancelArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message: 'No version with archiving initiated found',
      })
    })

    it('throws conflict when the targeted version is no longer in Review', async () => {
      const { db, query } = createSqlServerDb()
      query.mockResolvedValueOnce([{ id: 21, statusId: 3 }])

      await expect(cancelArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message:
          'Can only cancel archiving from Review status with archiving initiated',
      })
    })

    it('throws conflict when the conditional UPDATE affects zero rows', async () => {
      const { db, query } = createSqlServerDb()
      query
        .mockResolvedValueOnce([{ id: 21, statusId: 2 }])
        .mockResolvedValueOnce([])

      await expect(cancelArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message: 'No version with archiving initiated found',
      })
    })
  })
})
