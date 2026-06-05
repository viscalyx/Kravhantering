import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSpecification,
  createSpecificationLocalRequirement,
  createSpecificationNeedsReference,
  deleteSpecification,
  deleteSpecificationItemsByRefs,
  deleteSpecificationLocalRequirement,
  deleteSpecificationNeedsReference,
  getOrCreateSpecificationNeedsReference,
  getSpecificationById,
  getSpecificationLocalRequirementDetail,
  graduateSpecificationLocalRequirementToLibrary,
  isSlugTaken,
  linkRequirementsToSpecificationAtomically,
  listSpecificationItems,
  listSpecificationNeedsReferences,
  listSpecifications,
  unlinkRequirementsFromSpecification,
  updateSpecification,
  updateSpecificationItemFieldsByItemRef,
  updateSpecificationLocalRequirement,
  updateSpecificationNeedsReference,
} from '@/lib/dal/requirements-specifications'
import { DEFAULT_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'

function createSqlServerDb() {
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const getRepository = vi.fn()
  const transaction = vi.fn(async (callback: (manager: unknown) => unknown) =>
    callback({ query }),
  )
  const db = {
    getRepository,
    query,
    transaction,
  } as unknown as Parameters<typeof listSpecifications>[0]

  return { db, query, transaction }
}

describe('requirements-specifications DAL (SQL Server path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists specifications with combined item counts and sorted requirement areas', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 1,
          uniqueId: 'PKG-001',
          name: 'Specification A',
          specificationGovernanceObjectTypeId: 4,
          specificationImplementationTypeId: 2,
          specificationLifecycleStatusId: 3,
          businessNeedsReference: 'Strategic need',
          responsibleHsaId: 'SE5560000001-ada1',
          responsibleDisplayName: 'Ada Admin',
          canResponsibleGenerateAi: 1,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
          governanceObjectTypeNameSv: 'Plattform',
          governanceObjectTypeNameEn: 'Platform',
          implementationTypeNameSv: 'Införande',
          implementationTypeNameEn: 'Implementation',
          lifecycleStatusNameSv: 'Planerad',
          lifecycleStatusNameEn: 'Planned',
        },
      ])
      .mockResolvedValueOnce([{ specificationId: 1, count: 2 }])
      .mockResolvedValueOnce([{ specificationId: 1, count: 1 }])
      .mockResolvedValueOnce([
        { specificationId: 1, areaId: 8, areaName: 'Security' },
      ])

    const result = await listSpecifications(db)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'FROM requirements_specifications specification_record',
      ),
    )
    expect(result).toEqual([
      {
        id: 1,
        uniqueId: 'PKG-001',
        name: 'Specification A',
        specificationGovernanceObjectTypeId: 4,
        specificationImplementationTypeId: 2,
        specificationLifecycleStatusId: 3,
        businessNeedsReference: 'Strategic need',
        responsibleHsaId: 'SE5560000001-ada1',
        responsibleDisplayName: 'Ada Admin',
        canResponsibleGenerateAi: true,
        createdAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-21T10:00:00.000Z',
        governanceObjectType: {
          id: 4,
          nameSv: 'Plattform',
          nameEn: 'Platform',
        },
        implementationType: {
          id: 2,
          nameSv: 'Införande',
          nameEn: 'Implementation',
        },
        lifecycleStatus: {
          id: 3,
          nameSv: 'Planerad',
          nameEn: 'Planned',
        },
        itemCount: 3,
        requirementAreas: [{ id: 8, name: 'Security' }],
      },
    ])
  })

  it('gets a specification by id with nested metadata', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 2,
        uniqueId: 'PKG-002',
        name: 'Specification B',
        specificationGovernanceObjectTypeId: 1,
        specificationImplementationTypeId: 5,
        specificationLifecycleStatusId: 7,
        businessNeedsReference: null,
        responsibleHsaId: 'SE5560000001-rita1',
        responsibleDisplayName: 'Rita Reviewer',
        canResponsibleGenerateAi: 0,
        createdAt: new Date('2026-04-20T09:00:00.000Z'),
        updatedAt: new Date('2026-04-21T09:00:00.000Z'),
        governanceObjectTypeId: 1,
        governanceObjectTypeNameSv: 'Säkerhet',
        governanceObjectTypeNameEn: 'Security',
        implementationTypeId: 5,
        implementationTypeNameSv: 'Anpassning',
        implementationTypeNameEn: 'Customization',
        lifecycleStatusId: 7,
        lifecycleStatusNameSv: 'Pågår',
        lifecycleStatusNameEn: 'In progress',
      },
    ])

    const result = await getSpecificationById(db, 2)

    expect(result).toEqual({
      id: 2,
      uniqueId: 'PKG-002',
      name: 'Specification B',
      specificationGovernanceObjectTypeId: 1,
      specificationImplementationTypeId: 5,
      specificationLifecycleStatusId: 7,
      businessNeedsReference: null,
      responsibleHsaId: 'SE5560000001-rita1',
      responsibleDisplayName: 'Rita Reviewer',
      canResponsibleGenerateAi: false,
      createdAt: '2026-04-20T09:00:00.000Z',
      updatedAt: '2026-04-21T09:00:00.000Z',
      governanceObjectType: { id: 1, nameSv: 'Säkerhet', nameEn: 'Security' },
      implementationType: {
        id: 5,
        nameSv: 'Anpassning',
        nameEn: 'Customization',
      },
      lifecycleStatus: {
        id: 7,
        nameSv: 'Pågår',
        nameEn: 'In progress',
      },
    })
  })

  it('checks slug collisions on the SQL Server path', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 9 }]).mockResolvedValueOnce([])

    await expect(isSlugTaken(db, 'PKG-009')).resolves.toBe(true)
    await expect(isSlugTaken(db, 'PKG-009', 9)).resolves.toBe(false)
  })

  it('lists specification needs references on the SQL Server path', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
        description: null,
        id: 4,
        libraryItemCount: 1,
        specificationLocalRequirementCount: 0,
        text: 'Accessibility need',
        updatedAt: new Date('2026-04-20T10:00:00.000Z'),
      },
      {
        createdAt: new Date('2026-04-21T10:00:00.000Z'),
        description: 'Security context',
        id: 8,
        libraryItemCount: 1,
        specificationLocalRequirementCount: 1,
        text: 'Security need',
        updatedAt: new Date('2026-04-22T10:00:00.000Z'),
      },
    ])

    const result = await listSpecificationNeedsReferences(db, 12)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'FROM specification_needs_references needs_reference',
      ),
      [12],
    )
    expect(result).toEqual([
      {
        createdAt: '2026-04-20T10:00:00.000Z',
        description: null,
        id: 4,
        libraryItemCount: 1,
        linkedItemCount: 1,
        specificationLocalRequirementCount: 0,
        text: 'Accessibility need',
        updatedAt: '2026-04-20T10:00:00.000Z',
      },
      {
        createdAt: '2026-04-21T10:00:00.000Z',
        description: 'Security context',
        id: 8,
        libraryItemCount: 1,
        linkedItemCount: 2,
        specificationLocalRequirementCount: 1,
        text: 'Security need',
        updatedAt: '2026-04-22T10:00:00.000Z',
      },
    ])
  })

  it('creates and updates specifications using OUTPUT on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 11,
          uniqueId: 'SPEC-011',
          name: 'Specification Eleven',
          specificationGovernanceObjectTypeId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: 'Need',
          responsibleHsaId: 'SE5560000001-ada1',
          responsibleDisplayName: 'Ada Admin',
          canResponsibleGenerateAi: 1,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-20T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 11,
          uniqueId: 'SPEC-011',
          name: 'Specification Eleven Updated',
          specificationGovernanceObjectTypeId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: null,
          responsibleHsaId: null,
          responsibleDisplayName: null,
          canResponsibleGenerateAi: 0,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])

    const created = await createSpecification(db, {
      uniqueId: 'SPEC-011',
      name: 'Specification Eleven',
      specificationGovernanceObjectTypeId: 2,
      specificationLifecycleStatusId: 4,
      businessNeedsReference: 'Need',
      responsibleHsaId: 'SE5560000001-ada1',
      responsibleDisplayName: 'Ada Admin',
      canResponsibleGenerateAi: true,
    })
    const updated = await updateSpecification(db, 11, {
      name: 'Specification Eleven Updated',
      businessNeedsReference: null,
      responsibleHsaId: null,
      responsibleDisplayName: null,
      canResponsibleGenerateAi: false,
    })

    expect(created).toMatchObject({
      id: 11,
      uniqueId: 'SPEC-011',
      name: 'Specification Eleven',
      specificationGovernanceObjectTypeId: 2,
      specificationLifecycleStatusId: 4,
      responsibleHsaId: 'SE5560000001-ada1',
      responsibleDisplayName: 'Ada Admin',
      canResponsibleGenerateAi: true,
    })
    expect(updated).toMatchObject({
      id: 11,
      name: 'Specification Eleven Updated',
      businessNeedsReference: null,
      responsibleHsaId: null,
      responsibleDisplayName: null,
      canResponsibleGenerateAi: false,
    })
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO requirements_specifications'),
      [
        'SPEC-011',
        'Specification Eleven',
        2,
        null,
        4,
        'Need',
        'SE5560000001-ada1',
        'Ada Admin',
        1,
        expect.any(Date),
      ],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE requirements_specifications'),
      [
        'Specification Eleven Updated',
        null,
        null,
        null,
        0,
        expect.any(Date),
        11,
      ],
    )
  })

  it('deletes specification records inside a SQL Server transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValue([])

    await deleteSpecification(db, 7)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM specification_local_requirements WHERE specification_id = @0',
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM requirements_specification_items WHERE requirements_specification_id = @0',
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM specification_needs_references WHERE specification_id = @0',
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      4,
      'DELETE FROM requirements_specifications WHERE id = @0',
      [7],
    )
  })

  it('gets or creates a specification needs reference on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 33 }])

    const result = await getOrCreateSpecificationNeedsReference(
      db,
      5,
      'Shared specification need',
    )

    expect(result).toBe(33)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO specification_needs_references'),
      [5, 'Shared specification need', null, expect.any(Date)],
    )
  })

  it('creates specification needs references with descriptions on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
        description: 'Access management work',
        id: 33,
        libraryItemCount: 0,
        specificationLocalRequirementCount: 0,
        text: 'IAM-42',
        updatedAt: new Date('2026-04-20T10:00:00.000Z'),
      },
    ])

    const result = await createSpecificationNeedsReference(db, 5, {
      description: ' Access management work ',
      text: ' IAM-42 ',
    })

    expect(result).toMatchObject({
      description: 'Access management work',
      id: 33,
      linkedItemCount: 0,
      text: 'IAM-42',
    })
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM specification_needs_references'),
      [5, 'IAM-42'],
    )
    expect(query.mock.calls[0]?.[0]).not.toContain('needs_reference.id <> @2')
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO specification_needs_references'),
      [5, 'IAM-42', 'Access management work', expect.any(Date)],
    )
  })

  it('rejects duplicate specification needs references before insert', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 33 }])

    await expect(
      createSpecificationNeedsReference(db, 5, {
        description: null,
        text: 'IAM-42',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'Needs reference already exists in this specification',
    })

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('updates specification needs references on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ id: 33, text: 'IAM-42' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          description: 'Updated context',
          id: 33,
          libraryItemCount: 1,
          specificationLocalRequirementCount: 1,
          text: 'IAM-43',
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])

    const result = await updateSpecificationNeedsReference(db, 5, 33, {
      description: ' Updated context ',
      text: ' IAM-43 ',
    })

    expect(result).toMatchObject({
      description: 'Updated context',
      id: 33,
      linkedItemCount: 2,
      text: 'IAM-43',
    })
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('AND needs_reference.id <> @2'),
      [5, 'IAM-43', 33],
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE specification_needs_references'),
      ['IAM-43', 'Updated context', expect.any(Date), 33, 5],
    )
  })

  it('deletes only unused specification needs references', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          description: null,
          id: 33,
          libraryItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: new Date('2026-04-20T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ id: 33 }])

    await expect(deleteSpecificationNeedsReference(db, 5, 33)).resolves.toBe(
      true,
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM specification_needs_references'),
      [33, 5],
    )
  })

  it('blocks deleting specification needs references that are in use', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
        description: null,
        id: 33,
        libraryItemCount: 1,
        specificationLocalRequirementCount: 0,
        text: 'IAM-42',
        updatedAt: new Date('2026-04-20T10:00:00.000Z'),
      },
    ])

    await expect(
      deleteSpecificationNeedsReference(db, 5, 33),
    ).rejects.toMatchObject({
      code: 'conflict',
      message:
        'Needs reference is used by requirement applications or unique requirements',
    })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('gets specification-local requirement detail on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 21,
          specificationId: 5,
          uniqueId: 'LOK-001',
          description: 'Local requirement',
          acceptanceCriteria: 'Must pass',
          requiresTesting: 1,
          verificationMethod: 'Manual test',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
          needsReferenceId: 3,
          needsReference: 'Shared need',
          specificationItemStatusId: 2,
          specificationItemStatusColor: '#f59e0b',
          specificationItemStatusIconName: 'Clock',
          specificationItemStatusDescriptionEn: 'In progress',
          specificationItemStatusDescriptionSv: 'Pågående',
          specificationItemStatusNameEn: 'Ongoing',
          specificationItemStatusNameSv: 'Pågående',
          qualityCharacteristicId: 4,
          qualityCharacteristicNameEn: 'Security',
          qualityCharacteristicNameSv: 'Säkerhet',
          requirementCategoryId: 8,
          requirementCategoryNameEn: 'Functional',
          requirementCategoryNameSv: 'Funktionell',
          requirementTypeId: 9,
          requirementTypeNameEn: 'Business',
          requirementTypeNameSv: 'Verksamhet',
          riskLevelId: 10,
          riskLevelColor: '#dc2626',
          riskLevelIconName: 'ShieldAlert',
          riskLevelNameEn: 'High',
          riskLevelNameSv: 'Hög',
          riskLevelSortOrder: 3,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 11,
          name: 'ISO 27001',
          normReferenceId: 'ISO-27001',
          uri: 'https://example.test/iso-27001',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 13,
          name: 'Inloggning',
        },
      ])

    const result = await getSpecificationLocalRequirementDetail(db, 5, 21)

    expect(result).toEqual({
      acceptanceCriteria: 'Must pass',
      createdAt: '2026-04-20T10:00:00.000Z',
      description: 'Local requirement',
      id: 21,
      isSpecificationLocal: true,
      itemRef: 'local:21',
      kind: 'specificationLocal',
      needsReference: 'Shared need',
      needsReferenceId: 3,
      normReferences: [
        {
          id: 11,
          name: 'ISO 27001',
          normReferenceId: 'ISO-27001',
          uri: 'https://example.test/iso-27001',
        },
      ],
      specificationId: 5,
      specificationItemStatusColor: '#f59e0b',
      specificationItemStatusDescriptionEn: 'In progress',
      specificationItemStatusDescriptionSv: 'Pågående',
      specificationItemStatusIconName: 'Clock',
      specificationItemStatusId: 2,
      specificationItemStatusNameEn: 'Ongoing',
      specificationItemStatusNameSv: 'Pågående',
      qualityCharacteristic: {
        id: 4,
        nameEn: 'Security',
        nameSv: 'Säkerhet',
      },
      requirementArea: null,
      requirementCategory: {
        id: 8,
        nameEn: 'Functional',
        nameSv: 'Funktionell',
      },
      requirementType: {
        id: 9,
        nameEn: 'Business',
        nameSv: 'Verksamhet',
      },
      requiresTesting: true,
      riskLevel: {
        color: '#dc2626',
        iconName: 'ShieldAlert',
        id: 10,
        nameEn: 'High',
        nameSv: 'Hög',
        sortOrder: 3,
      },
      requirementPackages: [{ id: 13, name: 'Inloggning' }],
      uniqueId: 'LOK-001',
      updatedAt: '2026-04-21T10:00:00.000Z',
      verificationMethod: 'Manual test',
    })
  })

  it('creates and updates specification-local requirements on SQL Server', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ id: 11 }])
      .mockResolvedValueOnce([{ id: 13 }])
      .mockResolvedValueOnce([{ nextSequence: 2 }])
      .mockResolvedValueOnce([{ id: 41 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 41,
          specificationId: 5,
          uniqueId: 'LOK-001',
          description: 'Created local requirement',
          acceptanceCriteria: null,
          requiresTesting: 0,
          verificationMethod: null,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-20T10:00:00.000Z'),
          needsReferenceId: null,
          needsReference: null,
          specificationItemStatusId: 1,
          specificationItemStatusColor: '#22c55e',
          specificationItemStatusDescriptionEn: 'Default',
          specificationItemStatusDescriptionSv: 'Standard',
          specificationItemStatusNameEn: 'Default',
          specificationItemStatusNameSv: 'Standard',
          qualityCharacteristicId: null,
          requirementCategoryId: null,
          requirementTypeId: null,
          riskLevelId: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 41, specificationId: 5, sequenceNumber: 1, uniqueId: 'LOK-001' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 41,
          specificationId: 5,
          uniqueId: 'LOK-001',
          description: 'Updated local requirement',
          acceptanceCriteria: 'Updated AC',
          requiresTesting: 1,
          verificationMethod: 'Checklist',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
          needsReferenceId: null,
          needsReference: null,
          specificationItemStatusId: 1,
          specificationItemStatusColor: '#22c55e',
          specificationItemStatusDescriptionEn: 'Default',
          specificationItemStatusDescriptionSv: 'Standard',
          specificationItemStatusNameEn: 'Default',
          specificationItemStatusNameSv: 'Standard',
          qualityCharacteristicId: null,
          requirementCategoryId: null,
          requirementTypeId: null,
          riskLevelId: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const created = await createSpecificationLocalRequirement(db, 5, {
      description: 'Created local requirement',
      normReferenceIds: [11],
      requirementPackageIds: [13],
    })

    const updated = await updateSpecificationLocalRequirement(db, 5, 41, {
      acceptanceCriteria: 'Updated AC',
      description: 'Updated local requirement',
      requiresTesting: true,
      verificationMethod: 'Checklist',
    })

    expect(transaction).toHaveBeenCalledTimes(2)
    expect(created).toMatchObject({
      id: 41,
      uniqueId: 'LOK-001',
      description: 'Created local requirement',
      itemRef: 'local:41',
      specificationItemStatusId: DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
    })
    expect(updated).toMatchObject({
      id: 41,
      description: 'Updated local requirement',
      acceptanceCriteria: 'Updated AC',
      requiresTesting: true,
      verificationMethod: 'Checklist',
    })
    const localInsertCall = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO specification_local_requirements'),
    )
    expect(localInsertCall?.[1]).toEqual([
      5,
      'KRAV0001',
      1,
      'Created local requirement',
      null,
      null,
      null,
      null,
      null,
      0,
      null,
      null,
      DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
      expect.any(Date),
    ])
  })

  it('rejects unknown specification-local create references before inserts', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await expect(
      createSpecificationLocalRequirement(db, 5, {
        description: 'Created local requirement',
        requirementPackageIds: [13],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message:
        'requirementPackageIds references unknown requirement package id 13',
      status: 400,
    })

    expect(transaction).not.toHaveBeenCalled()
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([
      expect.stringContaining('FROM requirement_packages'),
    ])
  })

  it('rejects unknown specification-local update references before updates', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        { id: 41, specificationId: 5, sequenceNumber: 1, uniqueId: 'LOK-001' },
      ])
      .mockResolvedValueOnce([])

    await expect(
      updateSpecificationLocalRequirement(db, 5, 41, {
        description: 'Updated local requirement',
        qualityCharacteristicId: 9,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message:
        'qualityCharacteristicId references unknown quality characteristic id 9',
      status: 400,
    })

    expect(transaction).not.toHaveBeenCalled()
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([
      expect.stringContaining('FROM specification_local_requirements'),
      expect.stringContaining('FROM quality_characteristics'),
    ])
  })

  it('deletes specification-local requirements on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 41 }]).mockResolvedValueOnce([])

    await expect(deleteSpecificationLocalRequirement(db, 5, 41)).resolves.toBe(
      true,
    )
    await expect(deleteSpecificationLocalRequirement(db, 5, 99)).resolves.toBe(
      false,
    )
  })

  it('graduates an Included specification-local requirement as a draft library copy', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: 'Local AC',
          description: 'Local description',
          id: 41,
          qualityCharacteristicId: 5,
          requirementCategoryId: 3,
          requirementTypeId: 4,
          requiresTesting: 1,
          riskLevelId: 2,
          specificationId: 5,
          specificationItemStatusId: 1,
          uniqueId: 'KRAV0001',
          verificationMethod: 'Inspection',
        },
      ])
      .mockResolvedValueOnce([{ normReferenceId: 11 }])
      .mockResolvedValueOnce([{ requirementPackageId: 13 }])
      .mockResolvedValueOnce([{ prefix: 'SEC', sequenceNumber: 9 }])
      .mockResolvedValueOnce([
        {
          id: 71,
          requirementAreaId: 8,
          sequenceNumber: 9,
          uniqueId: 'SEC0009',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 701,
          requirementId: 71,
          statusId: 1,
          versionNumber: 1,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await graduateSpecificationLocalRequirementToLibrary(db, {
      actorDisplayName: 'Ada Admin',
      actorHsaId: 'SE5560000001-ada1',
      specificationId: 5,
      specificationLocalRequirementId: 41,
      targetRequirementAreaId: 8,
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      requirement: {
        id: 71,
        requirementAreaId: 8,
        sequenceNumber: 9,
        uniqueId: 'SEC0009',
      },
      sourceLocalRequirement: {
        id: 41,
        specificationId: 5,
        uniqueId: 'KRAV0001',
      },
      version: {
        id: 701,
        requirementId: 71,
        statusId: 1,
        versionNumber: 1,
      },
    })
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE requirement_areas'),
      [8],
    )
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO requirements'),
      ['SEC0009', 8, 9, expect.any(Date)],
    )
    expect(query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('INSERT INTO requirement_versions'),
      [
        71,
        'Local description',
        'Local AC',
        3,
        4,
        5,
        2,
        1,
        1,
        'Inspection',
        expect.any(Date),
        'Ada Admin',
        'SE5560000001-ada1',
      ],
    )
    expect(query).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining(
        'INSERT INTO requirement_version_requirement_packages',
      ),
      [701, 13],
    )
    expect(query).toHaveBeenNthCalledWith(
      8,
      expect.stringContaining(
        'INSERT INTO requirement_version_norm_references',
      ),
      [701, 11],
    )
    expect(
      query.mock.calls.some(([sql]) =>
        /DELETE FROM specification_local_requirements|UPDATE specification_local_requirements/i.test(
          sql,
        ),
      ),
    ).toBe(false)
  })

  it('rejects graduation when the source local requirement is not Included', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: null,
          description: 'Local description',
          id: 41,
          qualityCharacteristicId: null,
          requirementCategoryId: null,
          requirementTypeId: null,
          requiresTesting: 0,
          riskLevelId: null,
          specificationId: 5,
          specificationItemStatusId: 2,
          uniqueId: 'KRAV0001',
          verificationMethod: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    await expect(
      graduateSpecificationLocalRequirementToLibrary(db, {
        actorDisplayName: 'Ada Admin',
        actorHsaId: 'SE5560000001-ada1',
        specificationId: 5,
        specificationLocalRequirementId: 41,
        targetRequirementAreaId: 8,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
    })
    expect(
      query.mock.calls.some(([sql]) =>
        /INSERT INTO requirements|INSERT INTO requirement_versions|UPDATE requirement_areas/i.test(
          sql,
        ),
      ),
    ).toBe(false)
  })

  it('links requirements to a specification atomically on SQL Server', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ id: 101 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 33 }])
      .mockResolvedValueOnce([{ id: 55 }])

    const addedCount = await linkRequirementsToSpecificationAtomically(db, 5, {
      requirementIds: [7],
      needsReferenceText: 'Shared need',
    })

    expect(addedCount).toBe(1)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM requirement_versions requirement_version'),
      [7, 3],
    )
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO requirements_specification_items'),
      [5, 7, 101, 33, DEFAULT_SPECIFICATION_ITEM_STATUS_ID, expect.any(Date)],
    )
  })

  it('lists requirement applications on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          areaName: 'Platform',
          categoryNameEn: 'Functional',
          categoryNameSv: 'Funktionell',
          description: 'Shared library requirement',
          isArchived: 0,
          needsReferenceId: 6,
          needsReferenceText: 'Shared need',
          normReferenceIds: 'ISO-27001',
          specificationItemId: 31,
          specificationItemStatusColor: '#22c55e',
          specificationItemStatusIconName: 'Circle',
          specificationItemStatusDescriptionEn: 'Included',
          specificationItemStatusDescriptionSv: 'Inkluderad',
          specificationItemStatusId: 1,
          specificationItemStatusNameEn: 'Included',
          specificationItemStatusNameSv: 'Inkluderad',
          qualityCharacteristicNameEn: 'Security',
          qualityCharacteristicNameSv: 'Säkerhet',
          requirementId: 11,
          requiresTesting: 1,
          riskLevelColor: '#dc2626',
          riskLevelIconName: 'ShieldAlert',
          riskLevelId: 4,
          riskLevelNameEn: 'High',
          riskLevelNameSv: 'Hög',
          riskLevelSortOrder: 3,
          statusColor: '#22c55e',
          statusId: 3,
          statusNameEn: 'Published',
          statusNameSv: 'Publicerad',
          typeNameEn: 'Business',
          typeNameSv: 'Verksamhet',
          uniqueId: 'REQ-001',
          requirementPackageIds: '2,3',
          versionNumber: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 41,
          uniqueId: 'KRAV0001',
          description: 'Local specification requirement',
          needsReferenceId: null,
          needsReferenceText: null,
          normReferenceIds: 'LOK-REF',
          specificationItemStatusColor: '#f59e0b',
          specificationItemStatusIconName: 'Clock',
          specificationItemStatusDescriptionEn: 'In progress',
          specificationItemStatusDescriptionSv: 'Pågående',
          specificationItemStatusId: 2,
          specificationItemStatusNameEn: 'Ongoing',
          specificationItemStatusNameSv: 'Pågående',
          qualityCharacteristicNameEn: 'Security',
          qualityCharacteristicNameSv: 'Säkerhet',
          requirementCategoryNameEn: 'Functional',
          requirementCategoryNameSv: 'Funktionell',
          requirementTypeNameEn: 'Business',
          requirementTypeNameSv: 'Verksamhet',
          requiresTesting: 0,
          riskLevelColor: '#eab308',
          riskLevelIconName: 'AlertTriangle',
          riskLevelId: 2,
          riskLevelNameEn: 'Medium',
          riskLevelNameSv: 'Medel',
          riskLevelSortOrder: 2,
          requirementPackageIds: '9',
        },
      ])

    const result = await listSpecificationItems(db, 5)

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'FROM requirements_specification_items specification_item',
      ),
      [5],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'FROM specification_local_requirements local_requirement',
      ),
      [5],
    )
    expect(result).toEqual([
      expect.objectContaining({
        id: -41,
        itemRef: 'local:41',
        kind: 'specificationLocal',
        area: null,
        specificationItemStatusIconName: 'Clock',
        uniqueId: 'KRAV0001',
        version: expect.objectContaining({
          riskLevelIconName: 'AlertTriangle',
        }),
      }),
      expect.objectContaining({
        id: 11,
        itemRef: 'lib:31',
        kind: 'library',
        specificationItemStatusIconName: 'Circle',
        uniqueId: 'REQ-001',
        version: expect.objectContaining({
          riskLevelIconName: 'ShieldAlert',
        }),
      }),
    ])
  })

  it('updates requirement application fields by item ref on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 31,
          specificationId: 5,
          requirementId: 7,
          requirementVersionId: 101,
          needsReferenceId: null,
          specificationItemStatusId: 1,
          note: null,
          statusUpdatedAt: null,
          unused1: null,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ id: 2 }])
      .mockResolvedValueOnce([])

    await updateSpecificationItemFieldsByItemRef(db, 5, 'lib:31', {
      note: 'Follow-up',
      specificationItemStatusId: 2,
    })

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'FROM specification_item_statuses specification_item_status',
      ),
      [2],
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE requirements_specification_items'),
      [2, expect.any(String), 'Follow-up', 31],
    )
  })

  it('rejects needs references from another specification before item updates', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 31,
          specificationId: 5,
          requirementId: 7,
          requirementVersionId: 101,
          needsReferenceId: null,
          specificationItemStatusId: 1,
          note: null,
          statusUpdatedAt: null,
          unused1: null,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([])

    await expect(
      updateSpecificationItemFieldsByItemRef(db, 5, 'lib:31', {
        needsReferenceId: 99,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message:
        'needsReferenceId does not belong to this requirements specification',
    })

    expect(query).toHaveBeenCalledTimes(2)
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM specification_needs_references'),
      [99, 5],
    )
  })

  it('rejects clearing library usage status before SQL update', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 31,
        specificationId: 5,
        requirementId: 7,
        requirementVersionId: 101,
        needsReferenceId: null,
        specificationItemStatusId: 1,
        note: null,
        statusUpdatedAt: null,
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
      },
    ])

    await expect(
      updateSpecificationItemFieldsByItemRef(db, 5, 'lib:31', {
        specificationItemStatusId: null,
      } as unknown as Parameters<
        typeof updateSpecificationItemFieldsByItemRef
      >[3]),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Usage status cannot be cleared',
    })

    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM requirements_specification_items'),
      [31],
    )
  })

  it('rejects custom library usage status before status lookup', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 31,
        specificationId: 5,
        requirementId: 7,
        requirementVersionId: 101,
        needsReferenceId: null,
        specificationItemStatusId: 1,
        note: null,
        statusUpdatedAt: null,
        createdAt: new Date('2026-04-20T10:00:00.000Z'),
      },
    ])

    await expect(
      updateSpecificationItemFieldsByItemRef(db, 5, 'lib:31', {
        specificationItemStatusId: 7,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Invalid usage status ID',
    })

    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM requirements_specification_items'),
      [31],
    )
  })

  it('rejects clearing specification-local item status before SQL update', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 41,
        itemRef: 'local:41',
        kind: 'specificationLocal',
      },
    ])

    await expect(
      updateSpecificationItemFieldsByItemRef(db, 5, 'local:41', {
        specificationItemStatusId: null,
      } as unknown as Parameters<
        typeof updateSpecificationItemFieldsByItemRef
      >[3]),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Usage status cannot be cleared',
    })

    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM specification_local_requirements'),
      [41, 5],
    )
  })

  it('unlinks requirements from a specification on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 31 }, { id: 32 }])

    const removedCount = await unlinkRequirementsFromSpecification(
      db,
      5,
      [7, 8],
    )

    expect(removedCount).toBe(2)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM requirements_specification_items'),
      [5, 7, 8],
    )
  })

  it('deletes mixed requirement applications by refs on SQL Server inside one transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 31 }]).mockResolvedValueOnce([{ id: 4 }])

    const result = await deleteSpecificationItemsByRefs(db, 5, [
      'lib:31',
      'local:4',
    ])

    expect(result).toEqual({
      deletedLibraryCount: 1,
      deletedSpecificationLocalCount: 1,
    })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('DELETE FROM requirements_specification_items'),
      [5, 31],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM specification_local_requirements'),
      [5, 4],
    )
  })
})
