import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPackage,
  createPackageLocalRequirement,
  deletePackage,
  deletePackageItemsByRefs,
  deletePackageLocalRequirement,
  getOrCreatePackageNeedsReference,
  getPackageById,
  getPackageLocalRequirementDetail,
  isSlugTaken,
  linkRequirementsToPackageAtomically,
  listPackageItems,
  listPackageNeedsReferences,
  listPackages,
  unlinkRequirementsFromPackage,
  updatePackage,
  updatePackageItemFieldsByItemRef,
  updatePackageLocalRequirement,
} from '@/lib/dal/requirement-packages'

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
          packageResponsibilityAreaId: 4,
          packageImplementationTypeId: 2,
          packageLifecycleStatusId: 3,
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
      .mockResolvedValueOnce([{ packageId: 1, count: 2 }])
      .mockResolvedValueOnce([{ packageId: 1, count: 1 }])
      .mockResolvedValueOnce([
        { packageId: 1, areaId: 8, areaName: 'Security' },
      ])
      .mockResolvedValueOnce([
        { packageId: 1, areaId: 4, areaName: 'Accessibility' },
      ])

    const result = await listPackages(db)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM requirement_packages package_record'),
    )
    expect(result).toEqual([
      {
        id: 1,
        uniqueId: 'PKG-001',
        name: 'Package A',
        packageResponsibilityAreaId: 4,
        packageImplementationTypeId: 2,
        packageLifecycleStatusId: 3,
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
        packageResponsibilityAreaId: 1,
        packageImplementationTypeId: 5,
        packageLifecycleStatusId: 7,
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
      packageResponsibilityAreaId: 1,
      packageImplementationTypeId: 5,
      packageLifecycleStatusId: 7,
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

    const result = await listPackageNeedsReferences(db, 12)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM package_needs_references needs_reference'),
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
          packageResponsibilityAreaId: 2,
          packageImplementationTypeId: null,
          packageLifecycleStatusId: 4,
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
          packageResponsibilityAreaId: 2,
          packageImplementationTypeId: null,
          packageLifecycleStatusId: 4,
          businessNeedsReference: null,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])

    const created = await createPackage(db, {
      uniqueId: 'PKG-011',
      name: 'Package Eleven',
      packageResponsibilityAreaId: 2,
      packageLifecycleStatusId: 4,
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
      packageResponsibilityAreaId: 2,
      packageLifecycleStatusId: 4,
    })
    expect(updated).toMatchObject({
      id: 11,
      name: 'Package Eleven Updated',
      businessNeedsReference: null,
    })
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO requirement_packages'),
      ['PKG-011', 'Package Eleven', 2, null, 4, 'Need'],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE requirement_packages'),
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
      'DELETE FROM package_local_requirements WHERE package_id = @0',
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM requirement_package_items WHERE requirement_package_id = @0',
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM package_needs_references WHERE package_id = @0',
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      4,
      'DELETE FROM requirement_packages WHERE id = @0',
      [7],
    )
  })

  it('gets or creates a package needs reference on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 33 }])

    const result = await getOrCreatePackageNeedsReference(
      db,
      5,
      'Shared package need',
    )

    expect(result).toBe(33)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO package_needs_references'),
      [5, 'Shared package need'],
    )
  })

  it('gets package-local requirement detail on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 21,
          packageId: 5,
          uniqueId: 'LOK-001',
          description: 'Local requirement',
          acceptanceCriteria: 'Must pass',
          requiresTesting: 1,
          verificationMethod: 'Manual test',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
          needsReferenceId: 3,
          needsReference: 'Shared need',
          packageItemStatusId: 2,
          packageItemStatusColor: '#f59e0b',
          packageItemStatusDescriptionEn: 'In progress',
          packageItemStatusDescriptionSv: 'Pågående',
          packageItemStatusNameEn: 'Ongoing',
          packageItemStatusNameSv: 'Pågående',
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

    const result = await getPackageLocalRequirementDetail(db, 5, 21)

    expect(result).toEqual({
      acceptanceCriteria: 'Must pass',
      createdAt: '2026-04-20T10:00:00.000Z',
      description: 'Local requirement',
      id: 21,
      isPackageLocal: true,
      itemRef: 'local:21',
      kind: 'packageLocal',
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
      packageId: 5,
      packageItemStatusColor: '#f59e0b',
      packageItemStatusDescriptionEn: 'In progress',
      packageItemStatusDescriptionSv: 'Pågående',
      packageItemStatusId: 2,
      packageItemStatusNameEn: 'Ongoing',
      packageItemStatusNameSv: 'Pågående',
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

  it('creates and updates package-local requirements on SQL Server', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ nextSequence: 2 }])
      .mockResolvedValueOnce([{ id: 41 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 41,
          packageId: 5,
          uniqueId: 'LOK-001',
          description: 'Created local requirement',
          acceptanceCriteria: null,
          requiresTesting: 0,
          verificationMethod: null,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-20T10:00:00.000Z'),
          needsReferenceId: null,
          needsReference: null,
          packageItemStatusId: 1,
          packageItemStatusColor: '#22c55e',
          packageItemStatusDescriptionEn: 'Default',
          packageItemStatusDescriptionSv: 'Standard',
          packageItemStatusNameEn: 'Default',
          packageItemStatusNameSv: 'Standard',
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
        { id: 41, packageId: 5, sequenceNumber: 1, uniqueId: 'LOK-001' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 41,
          packageId: 5,
          uniqueId: 'LOK-001',
          description: 'Updated local requirement',
          acceptanceCriteria: 'Updated AC',
          requiresTesting: 1,
          verificationMethod: 'Checklist',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
          needsReferenceId: null,
          needsReference: null,
          packageItemStatusId: 1,
          packageItemStatusColor: '#22c55e',
          packageItemStatusDescriptionEn: 'Default',
          packageItemStatusDescriptionSv: 'Standard',
          packageItemStatusNameEn: 'Default',
          packageItemStatusNameSv: 'Standard',
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

    const created = await createPackageLocalRequirement(db, 5, {
      description: 'Created local requirement',
      normReferenceIds: [11],
      requirementAreaId: 7,
      scenarioIds: [13],
    })

    const updated = await updatePackageLocalRequirement(db, 5, 41, {
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

  it('deletes package-local requirements on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 41 }]).mockResolvedValueOnce([])

    await expect(deletePackageLocalRequirement(db, 5, 41)).resolves.toBe(true)
    await expect(deletePackageLocalRequirement(db, 5, 99)).resolves.toBe(false)
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
      expect.stringContaining('INSERT INTO requirement_package_items'),
      [5, 7, 101, 33, 1],
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
          packageItemId: 31,
          packageItemStatusColor: '#22c55e',
          packageItemStatusDescriptionEn: 'Included',
          packageItemStatusDescriptionSv: 'Inkluderad',
          packageItemStatusId: 1,
          packageItemStatusNameEn: 'Included',
          packageItemStatusNameSv: 'Inkluderad',
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
          packageItemStatusColor: '#f59e0b',
          packageItemStatusDescriptionEn: 'In progress',
          packageItemStatusDescriptionSv: 'Pågående',
          packageItemStatusId: 2,
          packageItemStatusNameEn: 'Ongoing',
          packageItemStatusNameSv: 'Pågående',
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
      expect.stringContaining('FROM requirement_package_items package_item'),
      [5],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'FROM package_local_requirements local_requirement',
      ),
      [5],
    )
    expect(result).toEqual([
      expect.objectContaining({
        id: -41,
        itemRef: 'local:41',
        kind: 'packageLocal',
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
          packageId: 5,
          requirementId: 7,
          requirementVersionId: 101,
          needsReferenceId: null,
          packageItemStatusId: 1,
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
      packageItemStatusId: 2,
    })

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM package_item_statuses package_item_status'),
      [2],
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE requirement_package_items'),
      [2, expect.any(String), 'Follow-up', 31],
    )
  })

  it('unlinks requirements from a package on SQL Server', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 31 }, { id: 32 }])

    const removedCount = await unlinkRequirementsFromPackage(db, 5, [7, 8])

    expect(removedCount).toBe(2)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM requirement_package_items'),
      [5, 7, 8],
    )
  })

  it('deletes mixed package items by refs on SQL Server inside one transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 31 }]).mockResolvedValueOnce([{ id: 4 }])

    const result = await deletePackageItemsByRefs(db, 5, ['lib:31', 'local:4'])

    expect(result).toEqual({
      deletedLibraryCount: 1,
      deletedPackageLocalCount: 1,
    })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('DELETE FROM requirement_package_items'),
      [5, 31],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM package_local_requirements'),
      [5, 4],
    )
  })
})
