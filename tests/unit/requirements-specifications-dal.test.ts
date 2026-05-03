import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPackage,
  createSpecificationLocalRequirement,
  deletePackage,
  deletePackageItemsByRefs,
  deleteSpecificationLocalRequirement,
  getOrCreateSpecificationNeedsReference,
  getPackageById,
  getSpecificationLocalRequirementDetail,
  isSlugTaken,
  linkRequirementsToPackageAtomically,
  listPackageItems,
  listPackages,
  listSpecificationNeedsReferences,
  unlinkRequirementsFromPackage,
  updatePackage,
  updatePackageItemFieldsByItemRef,
  updateSpecificationLocalRequirement,
} from '@/lib/dal/requirements-specifications'

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
  } as unknown as Parameters<typeof listPackages>[0]

  return { db, query, transaction }
}

describe('requirement-packages DAL (SQL Server path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists packages with combined item counts and sorted requirement areas', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 1,
          uniqueId: 'PKG-001',
          name: 'Package A',
          specificationResponsibilityAreaId: 4,
          specificationImplementationTypeId: 2,
          specificationLifecycleStatusId: 3,
          businessNeedsReference: 'Strategic need',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
          responsibilityAreaNameSv: 'Plattform',
          responsibilityAreaNameEn: 'Platform',
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
      .mockResolvedValueOnce([
        { specificationId: 1, areaId: 4, areaName: 'Accessibility' },
      ])

    const result = await listPackages(db)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'FROM requirements_specifications package_record',
      ),
    )
    expect(result).toEqual([
      {
        id: 1,
        uniqueId: 'PKG-001',
        name: 'Package A',
        specificationResponsibilityAreaId: 4,
        specificationImplementationTypeId: 2,
        specificationLifecycleStatusId: 3,
        businessNeedsReference: 'Strategic need',
        createdAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-21T10:00:00.000Z',
        responsibilityArea: {
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
        requirementAreas: [
          { id: 4, name: 'Accessibility' },
          { id: 8, name: 'Security' },
        ],
      },
    ])
  })

  it('gets a package by id with nested metadata', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 2,
        uniqueId: 'PKG-002',
        name: 'Package B',
        specificationResponsibilityAreaId: 1,
        specificationImplementationTypeId: 5,
        specificationLifecycleStatusId: 7,
        businessNeedsReference: null,
        createdAt: new Date('2026-04-20T09:00:00.000Z'),
        updatedAt: new Date('2026-04-21T09:00:00.000Z'),
        responsibilityAreaId: 1,
        responsibilityAreaNameSv: 'Säkerhet',
        responsibilityAreaNameEn: 'Security',
        implementationTypeId: 5,
        implementationTypeNameSv: 'Anpassning',
        implementationTypeNameEn: 'Customization',
        lifecycleStatusId: 7,
        lifecycleStatusNameSv: 'Pågår',
        lifecycleStatusNameEn: 'In progress',
      },
    ])

    const result = await getPackageById(db, 2)

    expect(result).toEqual({
      id: 2,
      uniqueId: 'PKG-002',
      name: 'Package B',
      specificationResponsibilityAreaId: 1,
      specificationImplementationTypeId: 5,
      specificationLifecycleStatusId: 7,
      businessNeedsReference: null,
      createdAt: '2026-04-20T09:00:00.000Z',
      updatedAt: '2026-04-21T09:00:00.000Z',
      responsibilityArea: { id: 1, nameSv: 'Säkerhet', nameEn: 'Security' },
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

  it('lists package needs references on the SQL Server path', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { id: 4, text: 'Accessibility need' },
      { id: 8, text: 'Security need' },
    ])

    const result = await listSpecificationNeedsReferences(db, 12)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'FROM specification_needs_references needs_reference',
      ),
      [12],
    )
    expect(result).toEqual([
      { id: 4, text: 'Accessibility need' },
      { id: 8, text: 'Security need' },
    ])
  })

  it('creates and updates packages using OUTPUT on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 11,
          uniqueId: 'PKG-011',
          name: 'Package Eleven',
          specificationResponsibilityAreaId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: 'Need',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-20T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 11,
          uniqueId: 'PKG-011',
          name: 'Package Eleven Updated',
          specificationResponsibilityAreaId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: null,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])

    const created = await createPackage(db, {
      uniqueId: 'PKG-011',
      name: 'Package Eleven',
      specificationResponsibilityAreaId: 2,
      specificationLifecycleStatusId: 4,
      businessNeedsReference: 'Need',
    })
    const updated = await updatePackage(db, 11, {
      name: 'Package Eleven Updated',
      businessNeedsReference: null,
    })

    expect(created).toMatchObject({
      id: 11,
      uniqueId: 'PKG-011',
      name: 'Package Eleven',
      specificationResponsibilityAreaId: 2,
      specificationLifecycleStatusId: 4,
    })
    expect(updated).toMatchObject({
      id: 11,
      name: 'Package Eleven Updated',
      businessNeedsReference: null,
    })
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO requirements_specifications'),
      ['PKG-011', 'Package Eleven', 2, null, 4, 'Need', expect.any(Date)],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE requirements_specifications'),
      ['Package Eleven Updated', null, expect.any(Date), 11],
    )
  })

  it('deletes package records inside a SQL Server transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValue([])

    await deletePackage(db, 7)

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

  it('gets or creates a package needs reference on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 33 }])

    const result = await getOrCreateSpecificationNeedsReference(
      db,
      5,
      'Shared package need',
    )

    expect(result).toBe(33)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO specification_needs_references'),
      [5, 'Shared package need', expect.any(Date)],
    )
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
          specificationItemStatusDescriptionEn: 'In progress',
          specificationItemStatusDescriptionSv: 'Pågående',
          specificationItemStatusNameEn: 'Ongoing',
          specificationItemStatusNameSv: 'Pågående',
          qualityCharacteristicId: 4,
          qualityCharacteristicNameEn: 'Security',
          qualityCharacteristicNameSv: 'Säkerhet',
          requirementAreaId: 7,
          requirementAreaName: 'Platform',
          requirementCategoryId: 8,
          requirementCategoryNameEn: 'Functional',
          requirementCategoryNameSv: 'Funktionell',
          requirementTypeId: 9,
          requirementTypeNameEn: 'Business',
          requirementTypeNameSv: 'Verksamhet',
          riskLevelId: 10,
          riskLevelColor: '#dc2626',
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
          nameEn: 'Login',
          nameSv: 'Inloggning',
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
      specificationItemStatusId: 2,
      specificationItemStatusNameEn: 'Ongoing',
      specificationItemStatusNameSv: 'Pågående',
      qualityCharacteristic: {
        id: 4,
        nameEn: 'Security',
        nameSv: 'Säkerhet',
      },
      requirementArea: { id: 7, name: 'Platform' },
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
        id: 10,
        nameEn: 'High',
        nameSv: 'Hög',
        sortOrder: 3,
      },
      scenarios: [{ id: 13, nameEn: 'Login', nameSv: 'Inloggning' }],
      uniqueId: 'LOK-001',
      updatedAt: '2026-04-21T10:00:00.000Z',
      verificationMethod: 'Manual test',
    })
  })

  it('creates and updates specification-local requirements on SQL Server', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
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
          requirementAreaId: 7,
          requirementAreaName: 'Platform',
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
          requirementAreaId: 7,
          requirementAreaName: 'Platform',
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
      requirementAreaId: 7,
      scenarioIds: [13],
    })

    const updated = await updateSpecificationLocalRequirement(db, 5, 41, {
      acceptanceCriteria: 'Updated AC',
      description: 'Updated local requirement',
      requirementAreaId: 7,
      requiresTesting: true,
      verificationMethod: 'Checklist',
    })

    expect(transaction).toHaveBeenCalledTimes(2)
    expect(created).toMatchObject({
      id: 41,
      uniqueId: 'LOK-001',
      description: 'Created local requirement',
      itemRef: 'local:41',
    })
    expect(updated).toMatchObject({
      id: 41,
      description: 'Updated local requirement',
      acceptanceCriteria: 'Updated AC',
      requiresTesting: true,
      verificationMethod: 'Checklist',
    })
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

  it('links requirements to a package atomically on SQL Server', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ id: 101 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 33 }])
      .mockResolvedValueOnce([{ id: 55 }])

    const addedCount = await linkRequirementsToPackageAtomically(db, 5, {
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
      [5, 7, 101, 33, 1, expect.any(Date)],
    )
  })

  it('lists package items on SQL Server', async () => {
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
          usageScenarioIds: '2,3',
          versionNumber: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 41,
          uniqueId: 'KRAV0001',
          description: 'Local package requirement',
          needsReferenceId: null,
          needsReferenceText: null,
          normReferenceIds: 'LOK-REF',
          specificationItemStatusColor: '#f59e0b',
          specificationItemStatusDescriptionEn: 'In progress',
          specificationItemStatusDescriptionSv: 'Pågående',
          specificationItemStatusId: 2,
          specificationItemStatusNameEn: 'Ongoing',
          specificationItemStatusNameSv: 'Pågående',
          qualityCharacteristicNameEn: 'Security',
          qualityCharacteristicNameSv: 'Säkerhet',
          requirementAreaName: 'Platform',
          requirementCategoryNameEn: 'Functional',
          requirementCategoryNameSv: 'Funktionell',
          requirementTypeNameEn: 'Business',
          requirementTypeNameSv: 'Verksamhet',
          requiresTesting: 0,
          riskLevelColor: '#eab308',
          riskLevelId: 2,
          riskLevelNameEn: 'Medium',
          riskLevelNameSv: 'Medel',
          riskLevelSortOrder: 2,
          usageScenarioIds: '9',
        },
      ])

    const result = await listPackageItems(db, 5)

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'FROM requirements_specification_items package_item',
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
        uniqueId: 'KRAV0001',
      }),
      expect.objectContaining({
        id: 11,
        itemRef: 'lib:31',
        kind: 'library',
        uniqueId: 'REQ-001',
      }),
    ])
  })

  it('updates package item fields by item ref on SQL Server', async () => {
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

    await updatePackageItemFieldsByItemRef(db, 5, 'lib:31', {
      note: 'Follow-up',
      specificationItemStatusId: 2,
    })

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'FROM specification_item_statuses package_item_status',
      ),
      [2],
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE requirements_specification_items'),
      [2, expect.any(String), 'Follow-up', 31],
    )
  })

  it('unlinks requirements from a package on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 31 }, { id: 32 }])

    const removedCount = await unlinkRequirementsFromPackage(db, 5, [7, 8])

    expect(removedCount).toBe(2)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM requirements_specification_items'),
      [5, 7, 8],
    )
  })

  it('deletes mixed package items by refs on SQL Server inside one transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 31 }]).mockResolvedValueOnce([{ id: 4 }])

    const result = await deletePackageItemsByRefs(db, 5, ['lib:31', 'local:4'])

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
