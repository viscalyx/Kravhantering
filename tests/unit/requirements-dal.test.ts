import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  editRequirement,
  getRequirementById,
  getRequirementByUniqueId,
} from '@/lib/dal/requirements'

function createSqlServerDb() {
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const getRepository = vi.fn()
  const transaction = vi.fn(
    async (callback: (manager: { query: typeof query }) => Promise<unknown>) =>
      callback({ query }),
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

  it('hydrates the requirement, area, versions, joins and package count', async () => {
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
      .mockResolvedValueOnce([{ packageCount: 2 }])

    const result = await getRequirementById(db, 7)

    expect(result).not.toBeNull()
    expect(result?.id).toBe(7)
    expect(result?.uniqueId).toBe('SEC-0001')
    expect(result?.isArchived).toBe(false)
    expect(result?.packageCount).toBe(2)
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

  it('rejects stale draft edits before rewriting joins', async () => {
    const { db, query } = createSqlServerDb()
    const editedAt = new Date('2026-04-20T08:30:00.000Z')
    query
      .mockResolvedValueOnce([
        {
          id: 21,
          statusId: 1,
          editedAt,
        },
      ])
      .mockResolvedValueOnce([])

    await expect(
      editRequirement(db, 7, {
        description: 'Stale update',
        expectedEditedAt: editedAt.toISOString(),
        normReferenceIds: [100],
        scenarioIds: [200],
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'stale_requirement_edit' },
    })

    const sqlCalls = query.mock.calls.map(([sql]) => String(sql))
    expect(sqlCalls[1]).toContain('edited_at = CONVERT(datetime2, @10, 127)')
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
})
