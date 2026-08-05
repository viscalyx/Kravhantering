import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveArchiving,
  cancelArchiving,
  createRequirement,
  createRequirementsBatch,
  createRequirementsBatchWithExecutor,
  deleteDraftVersion,
  editRequirement,
  getRequirementById,
  getRequirementByUniqueId,
  getVersionHistory,
  initiateArchiving,
  listRequirements,
  reactivateRequirement,
  restoreVersion,
  type SqlServerTxExecutor,
  transitionStatus,
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

function uniqueIndexViolation(indexName: string): Error {
  return Object.assign(
    new Error(
      `Cannot insert duplicate key row in object 'dbo.requirement_versions' with unique index '${indexName}'.`,
    ),
    { number: 2601 },
  )
}

describe('requirements DAL (SQL Server path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the canonical result when deleting the final draft and requirement row', async () => {
    const { db, query } = createSqlServerDb()
    const audit = vi.fn(async () => undefined)
    query
      .mockResolvedValueOnce([{ id: 21, statusId: 1, versionNumber: 10 }])
      .mockResolvedValueOnce([{ uniqueId: 'SEC-0001' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([])

    const result = await deleteDraftVersion(db, 7, { audit })

    expect(result).toEqual({
      deleted: [
        {
          requirementUniqueId: 'SEC-0001',
          type: 'draftRequirementVersion',
          versionNumber: 10,
        },
        { requirementUniqueId: 'SEC-0001', type: 'requirement' },
      ],
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      result,
    )
    const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls[0]).toContain('version_number AS versionNumber')
    expect(sqlCalls[1]).toContain(
      'SELECT TOP (1) unique_id AS uniqueId FROM requirements WHERE id = @0',
    )
    expect(sqlCalls[6]).toBe('DELETE FROM requirements WHERE id = @0')
    const auditOrder = audit.mock.invocationCallOrder[0] ?? 0
    const parentDeleteOrder = query.mock.invocationCallOrder[6] ?? 0
    expect(auditOrder).toBeLessThan(parentDeleteOrder)
  })

  it('returns the canonical result when deleting a draft version only', async () => {
    const { db, query } = createSqlServerDb()
    const audit = vi.fn(async () => undefined)
    query
      .mockResolvedValueOnce([{ id: 21, statusId: 1, versionNumber: 3 }])
      .mockResolvedValueOnce([{ uniqueId: 'SEC-0001' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 1 }])

    const result = await deleteDraftVersion(db, 7, { audit })

    expect(result).toEqual({
      deleted: [
        {
          requirementUniqueId: 'SEC-0001',
          type: 'draftRequirementVersion',
          versionNumber: 3,
        },
      ],
    })
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      result,
    )
    const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls).not.toContain('DELETE FROM requirements WHERE id = @0')
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

  it('hydrates requirement package names for requirement list rows', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 7,
        uniqueId: 'SEC-0001',
        requirementAreaId: 3,
        isArchived: 0,
        createdAt: new Date('2026-04-20T08:00:00.000Z'),
        versionId: 21,
        revisionToken: '11111111-1111-4111-8111-111111111111',
        versionNumber: 2,
        description: 'desc-v2',
        status: 3,
        verifiable: 1,
        versionCreatedAt: new Date('2026-04-20T08:30:00.000Z'),
        maxVersion: 2,
        requirementPackagesJson: JSON.stringify([
          { id: 200, name: 'Citizen portal' },
          { id: 201, name: 'Back office' },
        ]),
        suggestionCount: 0,
      },
    ])

    const rows = await listRequirements(db)

    expect(query.mock.calls[0]?.[0]).toContain('requirementPackagesJson')
    expect(rows[0]).toMatchObject({
      id: 7,
      requirementPackages: [
        { id: 200, name: 'Citizen portal' },
        { id: 201, name: 'Back office' },
      ],
      uniqueId: 'SEC-0001',
    })
  })

  it('normalizes sparse list rows, search matches, cursors, and malformed package payloads', async () => {
    const { db, query } = createSqlServerDb()
    const base = {
      createdAt: null,
      cursorNullRank: 1,
      cursorSortValue: 9,
      id: 7,
      isArchived: 'not-a-number',
      maxVersion: 1,
      requirementAreaId: 3,
      revisionToken: 'ABC',
      status: 1,
      suggestionCount: null,
      uniqueId: null,
      verifiable: false,
      versionCreatedAt: null,
      versionId: 21,
      versionNumber: 1,
    }
    query.mockResolvedValueOnce([
      {
        ...base,
        matchAcceptanceCriteria: 1,
        matchDescription: 1,
        matchId: true,
        matchUniqueId: 1,
        requirementPackagesJson: null,
      },
      { ...base, id: 8, requirementPackagesJson: '{broken' },
      { ...base, id: 9, requirementPackagesJson: '{}' },
      {
        ...base,
        id: 10,
        requirementPackagesJson: JSON.stringify([
          null,
          'invalid',
          { id: 0 },
          { id: 12 },
        ]),
      },
    ])

    const rows = await listRequirements(db)

    expect(rows[0]).toMatchObject({
      acceptanceCriteria: null,
      createdAt: '',
      cursorBoundary: { nullRank: 1, sortValue: 9 },
      isArchived: false,
      matchedFields: [
        'id',
        'uniqueId',
        'version.description',
        'version.acceptanceCriteria',
      ],
      requirementPackages: [],
      revisionToken: 'abc',
      suggestionCount: 0,
      uniqueId: '',
      versionCreatedAt: '',
    })
    expect(rows.slice(1, 3).map(row => row.requirementPackages)).toEqual([
      [],
      [],
    ])
    expect(rows[3]?.requirementPackages).toEqual([
      { id: 12, name: '', purposeAndScope: '' },
    ])
  })

  it('maps every populated list projection and string cursor without coercion loss', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        acceptanceCriteria: 'Criterion',
        archiveInitiatedAt: '2026-08-01T01:00:00.000Z',
        areaName: 'Security',
        categoryNameEn: 'Functional',
        categoryNameSv: 'Funktionell',
        createdAt: '2026-08-01T00:00:00.000Z',
        cursorNullRank: 0,
        cursorSortValue: 'SEC-0012',
        description: 'Mapped requirement',
        id: 12,
        isArchived: 1,
        maxVersion: 3,
        normReferenceIds: '10,20',
        normReferenceUris: 'https://one,https://two',
        pendingVersionStatusColor: '#00f',
        pendingVersionStatusIconName: 'clock',
        pendingVersionStatusId: 2,
        priorityLevelCode: 'P1',
        priorityLevelColor: '#f00',
        priorityLevelIconName: 'alert',
        priorityLevelId: 1,
        priorityLevelNameEn: 'Highest',
        priorityLevelNameSv: 'Högst',
        priorityLevelSortOrder: 'invalid',
        qualityCharacteristicId: 6,
        qualityCharacteristicNameEn: 'Security',
        qualityCharacteristicNameSv: 'Säkerhet',
        requirementAreaId: 3,
        requirementCategoryId: 4,
        requirementPackagesJson: JSON.stringify([
          { id: 7, name: 'Core', purposeAndScope: 'Baseline' },
        ]),
        requirementTypeId: 5,
        revisionToken: 'DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD',
        status: 3,
        statusColor: '#0f0',
        statusIconName: 'check',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        suggestionCount: 4,
        typeNameEn: 'Quality',
        typeNameSv: 'Kvalitet',
        uniqueId: 'SEC-0012',
        verifiable: 1,
        versionCreatedAt: '2026-08-01T00:30:00.000Z',
        versionId: 120,
        versionNumber: 3,
      },
    ])

    await expect(listRequirements(db)).resolves.toMatchObject([
      expect.objectContaining({
        acceptanceCriteria: 'Criterion',
        areaName: 'Security',
        cursorBoundary: {
          nullRank: 0,
          requirementId: 12,
          sortValue: 'SEC-0012',
        },
        priorityLevelSortOrder: null,
        requirementPackages: [
          { id: 7, name: 'Core', purposeAndScope: 'Baseline' },
        ],
        statusIconName: 'check',
      }),
    ])
  })

  it('creates requirements atomically and maps generated values', async () => {
    const { db, query, transaction } = createSqlServerDb()
    const audit = vi.fn(async () => undefined)
    query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ prefix: 'SEC-', sequenceNumber: 7 }])
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          id: 8,
          isArchived: 0,
          requirementAreaId: 1,
          sequenceNumber: 7,
          uniqueId: 'SEC-0007',
        },
      ])
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          description: 'Auditable',
          hasSpecificationItemHistory: 0,
          id: 80,
          requirementId: 8,
          revisionToken: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
          statusId: 1,
          verifiable: 0,
          versionNumber: 1,
        },
      ])

    const result = await createRequirement(
      db,
      { description: 'Auditable', requirementAreaId: 1 },
      { audit },
    )

    expect(transaction).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      requirement: { id: 8, uniqueId: 'SEC-0007' },
      version: {
        id: 80,
        revisionToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    })
    expect(audit).toHaveBeenCalledWith(expect.anything(), result)
  })

  it('creates a validated batch with per-row and batch audits in one executor', async () => {
    let sequence = 0
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('SELECT id') && sql.includes('WHERE id IN')) {
        return (parameters ?? []).map(id => ({ id }))
      }
      if (sql.includes('UPDATE requirement_areas')) {
        sequence += 1
        return [
          {
            prefix: sequence === 2 ? null : 'BAT-',
            sequenceNumber: sequence,
          },
        ]
      }
      if (sql.includes('INSERT INTO requirements (')) {
        return [
          {
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            id: sequence,
            isArchived: 0,
            requirementAreaId: 1,
            sequenceNumber: sequence,
            uniqueId: `BAT-${String(sequence).padStart(4, '0')}`,
          },
        ]
      }
      if (sql.includes('INSERT INTO requirement_versions (')) {
        return [
          {
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            description: `Batch ${sequence}`,
            hasSpecificationItemHistory: 0,
            id: 100 + sequence,
            requirementId: sequence,
            revisionToken: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB',
            statusId: 1,
            verifiable: sequence === 1,
            verificationMethod: sequence === 1 ? 'inspection' : null,
            versionNumber: 1,
          },
        ]
      }
      return []
    })
    const audit = vi.fn(async () => undefined)
    const batchAudit = vi.fn(async () => undefined)
    const executor = { query } as unknown as SqlServerTxExecutor

    await expect(
      createRequirementsBatchWithExecutor(
        executor,
        [
          {
            description: 'Batch one',
            normReferenceIds: [10],
            requirementAreaId: 1,
            requirementPackageIds: [20],
            verifiable: true,
            verificationMethod: 'inspection',
          },
          { description: 'Batch two', requirementAreaId: 1 },
        ],
        { audit, batchAudit },
      ),
    ).resolves.toHaveLength(2)
    expect(audit).toHaveBeenCalledTimes(2)
    expect(batchAudit).toHaveBeenCalledOnce()
    expect(
      query.mock.calls.some(([sql]) => sql.includes('norm_references')),
    ).toBe(true)
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('requirement_version_requirement_packages'),
      ),
    ).toBe(true)
    await expect(
      createRequirementsBatchWithExecutor(executor, []),
    ).resolves.toEqual([])
  })

  it('wraps non-empty batches in one transaction and skips empty batches', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockImplementation(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('SELECT id'))
        return (parameters ?? []).map(id => ({ id }))
      if (sql.includes('UPDATE requirement_areas')) {
        return [{ prefix: 'ONE-', sequenceNumber: 1 }]
      }
      if (sql.includes('INSERT INTO requirements (')) {
        return [{ id: 1, requirementAreaId: 1, sequenceNumber: 1 }]
      }
      if (sql.includes('INSERT INTO requirement_versions (')) {
        return [{ id: 2, requirementId: 1, statusId: 1, versionNumber: 1 }]
      }
      return []
    })

    await expect(createRequirementsBatch(db, [])).resolves.toEqual([])
    expect(transaction).not.toHaveBeenCalled()
    await expect(
      createRequirementsBatch(db, [
        { description: 'One', requirementAreaId: 1 },
      ]),
    ).resolves.toHaveLength(1)
    expect(transaction).toHaveBeenCalledOnce()
  })

  it('rejects missing areas in single and batch creation and missing sequence rows', async () => {
    const missingArea = createSqlServerDb()
    await expect(
      createRequirement(missingArea.db, {
        description: 'No area',
        requirementAreaId: undefined as never,
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      createRequirementsBatchWithExecutor(
        { query: missingArea.query } as unknown as SqlServerTxExecutor,
        [
          {
            description: 'No batch area',
            requirementAreaId: undefined as never,
          },
        ],
      ),
    ).rejects.toMatchObject({ code: 'validation' })

    const missingSequence = createSqlServerDb()
    missingSequence.query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([])
    await expect(
      createRequirement(missingSequence.db, {
        description: 'No sequence row',
        requirementAreaId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'not_found',
      message: 'Requirement area not found',
    })
  })

  it('rejects unknown requirement area ids before creating a requirement', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await expect(
      createRequirement(db, {
        description: 'Invalid area requirement',
        requirementAreaId: 99,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'requirementAreaId references unknown requirement area id 99',
      status: 400,
    })

    expect(transaction).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[0]).toContain('FROM requirement_areas')
    expect(query.mock.calls[0]?.[1]).toEqual([99])
  })

  it('rejects unknown norm references before creating a requirement', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([])

    await expect(
      createRequirement(db, {
        description: 'Invalid norm reference requirement',
        normReferenceIds: [100],
        requirementAreaId: 1,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'normReferenceIds references unknown norm reference id 100',
      status: 400,
    })

    expect(transaction).not.toHaveBeenCalled()
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([
      expect.stringContaining('FROM requirement_areas'),
      expect.stringContaining('FROM norm_references'),
    ])
  })

  it('rejects unknown requirement packages before creating a requirement', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([])

    await expect(
      createRequirement(db, {
        description: 'Invalid package requirement',
        requirementAreaId: 1,
        requirementPackageIds: [200],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message:
        'requirementPackageIds references unknown requirement package id 200',
      status: 400,
    })

    expect(transaction).not.toHaveBeenCalled()
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([
      expect.stringContaining('FROM requirement_areas'),
      expect.stringContaining('FROM requirement_packages'),
    ])
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
          areaOwnerHsaId: 'SE5560000001-area1',
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
          priorityLevelId: 1,
          statusId: 3,
          verifiable: 1,
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
          rlCode: 'P4',
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
          requirementPackageId: 200,
          packageId: 200,
          packageName: 'Citizen portal',
          packagePurposeAndScope: 'Citizen self-service requirements.',
          packageOwnerId: null,
          packageCreatedAt: new Date('2026-03-01T00:00:00.000Z'),
          packageUpdatedAt: new Date('2026-03-02T00:00:00.000Z'),
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
      ownerHsaId: 'SE5560000001-area1',
      nextSequence: 2,
      createdAt: '2026-04-19T08:00:00.000Z',
      updatedAt: '2026-04-19T09:00:00.000Z',
    })
    expect(result?.versions).toHaveLength(1)
    const version = result?.versions[0]
    expect(version?.id).toBe(21)
    expect(version?.revisionToken).toBe('11111111-1111-4111-8111-111111111111')
    expect(version?.versionNumber).toBe(2)
    expect(version?.verifiable).toBe(true)
    expect(version?.status).toBe(3)
    expect(version?.statusNameEn).toBe('Published')
    expect(version?.statusNameSv).toBe('Publicerad')
    expect(version?.statusColor).toBe('#22c55e')
    expect(version?.category).toEqual({
      id: 4,
      nameEn: 'Functional',
      nameSv: 'Funktionell',
    })
    expect(version?.priorityLevel).toEqual({
      code: 'P4',
      id: 1,
      nameEn: 'High',
      nameSv: 'Hög',
      color: '#ff0000',
      iconName: null,
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
    expect(version?.versionRequirementPackages).toEqual([
      {
        requirementVersionId: 21,
        requirementPackageId: 200,
        requirementPackage: {
          id: 200,
          name: 'Citizen portal',
          ownerId: null,
          purposeAndScope: 'Citizen self-service requirements.',
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-02T00:00:00.000Z',
        },
      },
    ])
  })

  it('hydrates sparse requirement details without lookup or join rows', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          areaId: null,
          createdAt: null,
          id: 8,
          isArchived: 1,
          requirementAreaId: 3,
          sequenceNumber: 2,
          uniqueId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: null,
          archiveInitiatedAt: null,
          archivedAt: null,
          categoryId: null,
          createdAt: null,
          createdBy: null,
          description: null,
          editedAt: null,
          id: 22,
          priorityLevelId: null,
          publishedAt: null,
          qcId: null,
          requirementId: 8,
          revisionToken: null,
          rlId: null,
          statusId: 1,
          statusRowId: null,
          typeId: null,
          verifiable: 'invalid',
          verificationMethod: null,
          versionNumber: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          nrCreatedAt: null,
          nrId: 50,
          nrIssuer: null,
          nrName: null,
          nrNormReferenceId: null,
          nrReference: null,
          nrType: null,
          nrUpdatedAt: null,
          nrUri: null,
          nrVersion: null,
          normReferenceId: 50,
          requirementVersionId: 22,
        },
      ])
      .mockResolvedValueOnce([
        {
          packageCreatedAt: null,
          packageId: 60,
          packageName: null,
          packageOwnerId: 'invalid',
          packagePurposeAndScope: null,
          packageUpdatedAt: null,
          requirementPackageId: 60,
          requirementVersionId: 22,
        },
      ])
      .mockResolvedValueOnce([])

    await expect(getRequirementById(db, 8)).resolves.toMatchObject({
      area: null,
      createdAt: '',
      isArchived: true,
      specificationCount: 0,
      uniqueId: '',
      versions: [
        {
          acceptanceCriteria: null,
          category: null,
          createdAt: '',
          qualityCharacteristic: null,
          priorityLevel: null,
          revisionToken: '',
          statusColor: null,
          statusIconName: null,
          statusNameEn: null,
          statusNameSv: null,
          type: null,
          verifiable: false,
          verificationMethod: null,
          versionNormReferences: [
            {
              normReference: {
                createdAt: '',
                issuer: null,
                name: '',
                normReferenceId: '',
                reference: '',
                type: '',
                updatedAt: '',
                uri: null,
                version: null,
              },
            },
          ],
          versionRequirementPackages: [
            {
              requirementPackage: {
                createdAt: '',
                name: null,
                ownerId: null,
                purposeAndScope: null,
                updatedAt: '',
              },
            },
          ],
        },
      ],
    })
  })

  it('skips join lookups when a requirement has no versions', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          areaId: null,
          createdAt: null,
          id: 9,
          isArchived: 0,
          requirementAreaId: 3,
          sequenceNumber: 3,
          uniqueId: 'SEC-0009',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ specificationCount: 0 }])

    await expect(getRequirementById(db, 9)).resolves.toMatchObject({
      versions: [],
    })
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('maps rich and sparse version history rows and groups package links', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: 'Criterion',
          archiveInitiatedAt: new Date('2026-08-01T04:00:00.000Z'),
          archivedAt: new Date('2026-08-01T05:00:00.000Z'),
          categoryId: 4,
          categoryNameEn: 'Functional',
          categoryNameSv: 'Funktionell',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          createdBy: 'Author',
          description: 'Published requirement',
          editedAt: new Date('2026-08-01T01:00:00.000Z'),
          id: 31,
          priorityLevelId: 2,
          publishedAt: new Date('2026-08-01T02:00:00.000Z'),
          qcId: 6,
          qcNameEn: 'Security',
          qcNameSv: 'Säkerhet',
          requirementId: 7,
          revisionToken: 'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC',
          statusColor: '#0f0',
          statusIconName: 'check',
          statusId: 3,
          statusNameEn: 'Published',
          statusNameSv: 'Publicerad',
          statusRowId: 3,
          typeId: 5,
          typeNameEn: 'Quality',
          typeNameSv: 'Kvalitet',
          verifiable: 1,
          verificationMethod: 'test',
          versionNumber: 2,
        },
        {
          acceptanceCriteria: null,
          categoryId: null,
          createdAt: null,
          createdBy: null,
          description: null,
          id: 30,
          qcId: null,
          requirementId: 7,
          revisionToken: null,
          statusColor: null,
          statusIconName: null,
          statusId: 1,
          statusNameEn: null,
          statusNameSv: null,
          statusRowId: null,
          typeId: null,
          verifiable: 0,
          verificationMethod: null,
          versionNumber: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          packageId: 8,
          packageName: 'Core',
          requirementPackageId: 8,
          requirementVersionId: 31,
        },
        {
          packageId: 9,
          packageName: null,
          requirementPackageId: 9,
          requirementVersionId: 31,
        },
      ])

    const history = await getVersionHistory(db, 7)

    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      category: { id: 4, nameEn: 'Functional' },
      qualityCharacteristic: { id: 6, nameEn: 'Security' },
      revisionToken: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      type: { id: 5, nameEn: 'Quality' },
      versionRequirementPackages: [
        { requirementPackage: { id: 8, name: 'Core' } },
        { requirementPackage: { id: 9, name: null } },
      ],
    })
    expect(history[1]).toMatchObject({
      acceptanceCriteria: null,
      category: null,
      createdAt: '',
      createdBy: null,
      description: '',
      qualityCharacteristic: null,
      revisionToken: '',
      statusColor: null,
      statusIconName: null,
      statusNameEn: null,
      statusNameSv: null,
      type: null,
      verificationMethod: null,
      versionRequirementPackages: [],
    })

    query.mockReset().mockResolvedValueOnce([])
    await expect(getVersionHistory(db, 7)).resolves.toEqual([])
    expect(query).toHaveBeenCalledTimes(1)
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
        requirementPackageIds: [200],
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
        sql.includes('DELETE FROM requirement_version_requirement_packages'),
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
        requirementPackageIds: [200],
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
        sql.includes('DELETE FROM requirement_version_requirement_packages'),
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

  it('rejects unknown edit references after stale and status checks but before mutations', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 21,
          revisionToken: '11111111-1111-4111-8111-111111111111',
          statusId: 1,
        },
      ])
      .mockResolvedValueOnce([])

    await expect(
      editRequirement(db, 7, {
        baseRevisionToken: '11111111-1111-4111-8111-111111111111',
        baseVersionId: 21,
        description: 'Invalid package edit',
        requirementPackageIds: [200],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message:
        'requirementPackageIds references unknown requirement package id 200',
      status: 400,
    })

    const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls).toHaveLength(2)
    expect(sqlCalls[0]).toContain('WITH (UPDLOCK, HOLDLOCK)')
    expect(sqlCalls[1]).toContain('FROM requirement_packages')
    expect(
      sqlCalls.some(sql => sql.includes('UPDATE requirement_versions')),
    ).toBe(false)
    expect(
      sqlCalls.some(sql =>
        sql.includes('DELETE FROM requirement_version_requirement_packages'),
      ),
    ).toBe(false)
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
          verifiable: 0,
          revisionToken: '22222222-2222-4222-8222-222222222222',
          priorityLevelId: null,
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
      requirementPackageIds: [],
    })

    const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls[1]).toContain('revision_token = NEWID()')
    expect(sqlCalls[1]).toContain(
      'revision_token = CONVERT(uniqueidentifier, @10)',
    )
    expect(result.revisionToken).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('validates optimistic edit preconditions before opening a transaction', async () => {
    const { db, transaction } = createSqlServerDb()

    await expect(
      editRequirement(db, 7, {
        baseRevisionToken: '11111111-1111-4111-8111-111111111111',
        description: 'Missing version',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      editRequirement(db, 7, {
        baseRevisionToken: '   ',
        baseVersionId: 1,
        description: 'Missing token',
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      editRequirement(db, 7, {
        baseRevisionToken: 'not-a-guid',
        baseVersionId: 1,
        description: 'Invalid token',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'invalid_edit_precondition' },
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects missing, archived, and concurrently changed draft versions', async () => {
    const token = '11111111-1111-4111-8111-111111111111'

    const missing = createSqlServerDb()
    missing.query.mockResolvedValueOnce([])
    await expect(
      editRequirement(missing.db, 7, {
        baseRevisionToken: token,
        baseVersionId: 21,
        description: 'Missing',
      }),
    ).rejects.toMatchObject({ code: 'not_found' })

    const archived = createSqlServerDb()
    archived.query.mockResolvedValueOnce([
      { id: 21, revisionToken: token, statusId: 4 },
    ])
    await expect(
      editRequirement(archived.db, 7, {
        baseRevisionToken: token,
        baseVersionId: 21,
        description: 'Archived',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'Cannot edit an archived requirement — restore it first',
    })

    const changed = createSqlServerDb()
    changed.query
      .mockResolvedValueOnce([{ id: 21, revisionToken: token, statusId: 1 }])
      .mockResolvedValueOnce([])
    await expect(
      editRequirement(changed.db, 7, {
        baseRevisionToken: token,
        baseVersionId: 21,
        description: 'Changed concurrently',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'stale_requirement_edit' },
    })
  })

  it('creates a successor draft when editing a published requirement', async () => {
    const { db, query } = createSqlServerDb()
    const token = '11111111-1111-4111-8111-111111111111'
    query
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: 'Old',
          createdBy: 'Author',
          createdByHsaId: 'SE5560000001-author1',
          description: 'Published',
          id: 21,
          revisionToken: token,
          statusId: 3,
          verifiable: 1,
          versionNumber: 2,
        },
      ])
      .mockResolvedValueOnce([{ maxVersion: 2 }])
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: 'New criterion',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          createdBy: 'Editor',
          createdByHsaId: 'SE5560000001-editor1',
          description: 'Successor draft',
          hasSpecificationItemHistory: 0,
          id: 22,
          requirementId: 7,
          revisionToken: 'EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE',
          statusId: 1,
          verifiable: 1,
          verificationMethod: 'review',
          versionNumber: 3,
        },
      ])

    await expect(
      editRequirement(db, 7, {
        acceptanceCriteria: 'New criterion',
        baseRevisionToken: token,
        baseVersionId: 21,
        createdBy: 'Editor',
        createdByHsaId: 'SE5560000001-editor1',
        description: 'Successor draft',
        verifiable: true,
        verificationMethod: 'review',
      }),
    ).resolves.toMatchObject({ id: 22, versionNumber: 3 })
    expect(query.mock.calls[1]?.[0]).toContain('MAX(version_number)')
    expect(query.mock.calls[2]?.[0]).toContain(
      'INSERT INTO requirement_versions',
    )
  })

  it('rejects draft deletion when the latest version is absent or not a draft', async () => {
    const missing = createSqlServerDb()
    missing.query.mockResolvedValueOnce([])
    await expect(deleteDraftVersion(missing.db, 7)).rejects.toMatchObject({
      code: 'conflict',
    })

    const published = createSqlServerDb()
    published.query.mockResolvedValueOnce([{ id: 21, statusId: 3 }])
    await expect(deleteDraftVersion(published.db, 7)).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('rejects reactivation when no archived latest version exists', async () => {
    const missing = createSqlServerDb()
    missing.query.mockResolvedValueOnce([])
    await expect(reactivateRequirement(missing.db, 7)).rejects.toMatchObject({
      code: 'not_found',
    })

    const active = createSqlServerDb()
    active.query.mockResolvedValueOnce([{ id: 21, statusId: 3 }])
    await expect(reactivateRequirement(active.db, 7)).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('restores creator attribution as an atomic actor snapshot', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: null,
          createdBy: 'Original Actor',
          createdByHsaId: 'SE5560000001-original',
          description: 'Archived text',
          id: 21,
          qualityCharacteristicId: null,
          requirementCategoryId: null,
          requirementId: 7,
          requirementTypeId: null,
          verifiable: 0,
          priorityLevelId: null,
          verificationMethod: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ maxVersion: 2 }])
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: null,
          archiveInitiatedAt: null,
          archivedAt: null,
          createdAt: new Date('2026-04-20T08:30:00.000Z'),
          createdBy: 'Original Actor',
          createdByHsaId: 'SE5560000001-original',
          description: 'Archived text',
          editedAt: new Date('2026-04-20T08:30:00.000Z'),
          id: 22,
          publishedAt: null,
          qualityCharacteristicId: null,
          requirementCategoryId: null,
          requirementId: 7,
          requirementTypeId: null,
          verifiable: 0,
          revisionToken: '33333333-3333-4333-8333-333333333333',
          priorityLevelId: null,
          statusId: 1,
          verificationMethod: null,
          versionNumber: 3,
        },
      ])

    const result = await restoreVersion(db, 7, 21, 'New Actor')

    expect(result.createdBy).toBe('Original Actor')
    expect(result.createdByHsaId).toBe('SE5560000001-original')
    const insertParams = query.mock.calls[4]?.[1] ?? []
    expect(insertParams.at(13)).toBe('Original Actor')
    expect(insertParams.at(14)).toBe('SE5560000001-original')
  })

  it('reactivates archived requirements atomically and clears the archived flag', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ id: 21, statusId: 4 }])
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: null,
          createdBy: 'Original Actor',
          createdByHsaId: 'SE5560000001-original',
          description: 'Archived text',
          id: 21,
          qualityCharacteristicId: null,
          requirementCategoryId: null,
          requirementId: 7,
          requirementTypeId: null,
          verifiable: 0,
          priorityLevelId: null,
          verificationMethod: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ maxVersion: 2 }])
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: null,
          archiveInitiatedAt: null,
          archivedAt: null,
          createdAt: new Date('2026-04-20T08:30:00.000Z'),
          createdBy: 'Reviewer',
          createdByHsaId: 'SE5560000001-reviewer1',
          description: 'Archived text',
          editedAt: new Date('2026-04-20T08:30:00.000Z'),
          id: 22,
          publishedAt: null,
          qualityCharacteristicId: null,
          requirementCategoryId: null,
          requirementId: 7,
          requirementTypeId: null,
          verifiable: 0,
          revisionToken: '33333333-3333-4333-8333-333333333333',
          priorityLevelId: null,
          statusId: 1,
          verificationMethod: null,
          versionNumber: 3,
        },
      ])
      .mockResolvedValueOnce([])

    await reactivateRequirement(db, 7, 'Reviewer', 'SE5560000001-reviewer1')

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0]?.[0]).toContain('WITH (UPDLOCK, HOLDLOCK)')
    expect(query.mock.calls.at(-1)).toEqual([
      'UPDATE requirements SET is_archived = 0 WHERE id = @0',
      [7],
    ])
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

    it('maps archive-in-progress unique index violations to conflict', async () => {
      const { db, query } = createSqlServerDb()
      query
        .mockResolvedValueOnce([{ id: 21, versionNumber: 1 }])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(
          uniqueIndexViolation(
            'uq_requirement_versions_archive_initiated_requirement_id',
          ),
        )

      await expect(initiateArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        details: {
          indexName: 'uq_requirement_versions_archive_initiated_requirement_id',
          reason: 'requirement_version_lifecycle_unique_index',
        },
        message: 'Requirement version lifecycle state is no longer unique',
      })
    })

    it('maps cyclic nested unique index errors without looping', async () => {
      const { db, query } = createSqlServerDb()
      const error = uniqueIndexViolation(
        'uq_requirement_versions_archive_initiated_requirement_id',
      ) as Error & { cause?: unknown }
      error.cause = error
      query
        .mockResolvedValueOnce([{ id: 21, versionNumber: 1 }])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(error)

      await expect(initiateArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        details: {
          indexName: 'uq_requirement_versions_archive_initiated_requirement_id',
          reason: 'requirement_version_lifecycle_unique_index',
        },
        message: 'Requirement version lifecycle state is no longer unique',
      })
    })
  })

  describe('approveArchiving', () => {
    it('runs reads and writes inside a SERIALIZABLE transaction and targets the row with archive_initiated_at IS NOT NULL', async () => {
      const { db, query, transaction } = createSqlServerDb()
      query
        .mockResolvedValueOnce([
          {
            archiveInitiatedAt: new Date('2026-04-20T09:00:00.000Z'),
            id: 21,
            statusId: 2,
          },
        ])
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
      query.mockResolvedValueOnce([
        {
          archiveInitiatedAt: new Date('2026-04-20T09:00:00.000Z'),
          id: 21,
          statusId: 1,
        },
      ])

      await expect(approveArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message:
          'Can only approve archiving from Review status with archiving initiated',
      })
    })

    it('throws conflict when the conditional UPDATE affects zero rows', async () => {
      const { db, query } = createSqlServerDb()
      query
        .mockResolvedValueOnce([
          {
            archiveInitiatedAt: new Date('2026-04-20T09:00:00.000Z'),
            id: 21,
            statusId: 2,
          },
        ])
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
        .mockResolvedValueOnce([
          {
            archiveInitiatedAt: new Date('2026-04-20T09:00:00.000Z'),
            id: 21,
            statusId: 2,
          },
        ])
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
      query.mockResolvedValueOnce([
        {
          archiveInitiatedAt: new Date('2026-04-20T09:00:00.000Z'),
          id: 21,
          statusId: 3,
        },
      ])

      await expect(cancelArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message:
          'Can only cancel archiving from Review status with archiving initiated',
      })
    })

    it('throws conflict when the conditional UPDATE affects zero rows', async () => {
      const { db, query } = createSqlServerDb()
      query
        .mockResolvedValueOnce([
          {
            archiveInitiatedAt: new Date('2026-04-20T09:00:00.000Z'),
            id: 21,
            statusId: 2,
          },
        ])
        .mockResolvedValueOnce([])

      await expect(cancelArchiving(db, 7)).rejects.toMatchObject({
        code: 'conflict',
        message: 'No version with archiving initiated found',
      })
    })
  })

  describe('transitionStatus', () => {
    it('publishes a successor and archives its predecessor with one timestamp inside the transaction', async () => {
      const { db, query, transaction } = createSqlServerDb()
      const publishedAt = new Date('2026-07-17T10:00:00.000Z')
      query
        .mockResolvedValueOnce([{ id: 3 }])
        .mockResolvedValueOnce([
          {
            archiveInitiatedAt: null,
            description: 'review successor',
            id: 22,
            revisionToken: '11111111-1111-4111-8111-111111111111',
            statusId: 2,
            verifiable: 0,
          },
        ])
        .mockResolvedValueOnce([{ isArchived: 0 }])
        .mockResolvedValueOnce([{ id: 12 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            acceptanceCriteria: null,
            archiveInitiatedAt: null,
            archivedAt: null,
            createdAt: publishedAt,
            createdBy: 'Reviewer',
            createdByHsaId: 'SE5560000001-reviewer1',
            description: 'review successor',
            editedAt: null,
            hasSpecificationItemHistory: 0,
            id: 22,
            priorityLevelId: null,
            publishedAt,
            qualityCharacteristicId: null,
            requirementCategoryId: null,
            requirementId: 7,
            requirementTypeId: null,
            revisionToken: '22222222-2222-4222-8222-222222222222',
            statusId: 3,
            statusUpdatedAt: publishedAt,
            verifiable: 0,
            verificationMethod: null,
            versionNumber: 2,
          },
        ])

      await transitionStatus(db, 7, 3)

      expect(transaction).toHaveBeenCalledTimes(1)
      const predecessorArchive = query.mock.calls[4]
      const successorPublish = query.mock.calls[7]
      expect(String(predecessorArchive?.[0])).toContain(
        'SET requirement_status_id = 4',
      )
      expect(String(successorPublish?.[0])).toContain('published_at = @2')
      expect(predecessorArchive?.[1]?.[0]).toBe(successorPublish?.[1]?.[1])
      expect(predecessorArchive?.[1]?.[0]).toBe(successorPublish?.[1]?.[2])
    })

    it('maps published-version unique index violations to conflict', async () => {
      const { db, query } = createSqlServerDb()
      query
        .mockResolvedValueOnce([{ id: 3 }])
        .mockResolvedValueOnce([
          {
            archiveInitiatedAt: null,
            description: 'review version',
            id: 22,
            verifiable: 0,
            revisionToken: '11111111-1111-4111-8111-111111111111',
            statusId: 2,
          },
        ])
        .mockResolvedValueOnce([{ isArchived: 0 }])
        .mockResolvedValueOnce([{ id: 12 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(
          uniqueIndexViolation(
            'uq_requirement_versions_published_requirement_id',
          ),
        )

      await expect(transitionStatus(db, 7, 3)).rejects.toMatchObject({
        code: 'conflict',
        details: {
          indexName: 'uq_requirement_versions_published_requirement_id',
          reason: 'requirement_version_lifecycle_unique_index',
        },
        message: 'Requirement version lifecycle state is no longer unique',
      })
    })
  })
})
