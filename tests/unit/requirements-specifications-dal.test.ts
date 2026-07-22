import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSpecification,
  createSpecificationLocalRequirement,
  createSpecificationNeedsReference,
  deleteSpecification,
  deleteSpecificationItemsByRefs,
  deleteSpecificationLocalRequirement,
  deleteSpecificationNeedsReference,
  getLibrarySpecificationItemMetadata,
  getOrCreateSpecificationNeedsReference,
  getSpecificationById,
  getSpecificationLocalRequirementDetail,
  graduateSpecificationLocalRequirementToLibrary,
  isSpecificationCodeTaken,
  linkRequirementsToSpecificationAtomically,
  listSpecificationNeedsReferences,
  listSpecifications,
  listSpecificationsForActorCatalog,
  listSpecificationTraceabilityItems,
  replaceSpecificationCoAuthors,
  unlinkRequirementsFromSpecification,
  updateSpecification,
  updateSpecificationItemFieldsByItemRef,
  updateSpecificationLocalRequirement,
  updateSpecificationNeedsReference,
  updateSpecificationResponsible,
} from '@/lib/dal/requirements-specifications'
import { DEFAULT_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'

function createSqlServerDb() {
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const getRepository = vi.fn()
  const transaction = vi.fn(async (...args: unknown[]) => {
    const callback =
      typeof args[0] === 'function'
        ? args[0]
        : typeof args[1] === 'function'
          ? args[1]
          : null
    if (!callback) throw new Error('Missing transaction callback')
    return (callback as (manager: unknown) => unknown)({ query })
  })
  const db = {
    getRepository,
    query,
    transaction,
  } as unknown as Parameters<typeof listSpecifications>[0]

  return { db, query, transaction }
}

function specificationCatalogRow(overrides: Record<string, unknown> = {}) {
  return {
    businessNeedsReference: null,
    createdAt: new Date('2026-04-20T10:00:00.000Z'),
    governanceObjectTypeNameEn: null,
    governanceObjectTypeNameSv: null,
    id: 1,
    implementationTypeNameEn: null,
    implementationTypeNameSv: null,
    itemCount: 0,
    lifecycleStatusNameEn: null,
    lifecycleStatusNameSv: null,
    name: 'Specification',
    responsibleGivenName: 'Ada',
    responsibleHsaId: 'SE5560000001-ada1',
    responsibleMiddleName: null,
    responsibleSurname: 'Admin',
    specificationCode: 'SPEC-001',
    specificationGovernanceObjectTypeId: null,
    specificationImplementationTypeId: null,
    specificationLifecycleStatusId: null,
    updatedAt: new Date('2026-04-21T10:00:00.000Z'),
    ...overrides,
  }
}

describe('requirements-specifications DAL (SQL Server path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves a nullable usage status in library item metadata', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        needsReference: null,
        needsReferenceId: null,
        specificationItemId: 31,
        specificationItemStatusColor: null,
        specificationItemStatusIconName: null,
        specificationItemStatusId: null,
        specificationItemStatusNameEn: null,
        specificationItemStatusNameSv: null,
      },
    ])

    await expect(
      getLibrarySpecificationItemMetadata(db, 7, 31),
    ).resolves.toMatchObject({
      specificationItemId: 31,
      specificationItemStatusId: null,
    })
  })

  it('lists specifications with combined item counts and sorted requirement areas', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 1,
          specificationCode: 'PKG-001',
          name: 'Specification A',
          specificationGovernanceObjectTypeId: 4,
          specificationImplementationTypeId: 2,
          specificationLifecycleStatusId: 3,
          businessNeedsReference: 'Strategic need',
          responsibleHsaId: 'SE5560000001-ada1',
          responsibleGivenName: 'Ada',
          responsibleMiddleName: null,
          responsibleSurname: 'Admin',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
          governanceObjectTypeNameSv: 'Plattform',
          governanceObjectTypeNameEn: 'Platform',
          implementationTypeNameSv: 'Införande',
          implementationTypeNameEn: 'Implementation',
          lifecycleStatusNameSv: 'Planerad',
          lifecycleStatusNameEn: 'Planned',
          itemCount: 3,
        },
      ])
      .mockResolvedValueOnce([
        { specificationId: 1, areaId: 8, areaName: 'Security' },
      ])
      .mockResolvedValueOnce([
        { specificationId: 1, hsaId: 'SE5560000001-coauthor1' },
        { specificationId: 1, hsaId: 'SE5560000001-coauthor1' },
      ])

    const result = await listSpecifications(db)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INNER JOIN requirements_specifications specification_record',
      ),
      [],
    )
    expect(String(query.mock.calls[1]?.[0])).toContain(
      'FROM selected_specifications',
    )
    expect(query.mock.calls[1]?.[1]).toEqual([])
    expect(String(query.mock.calls[2]?.[0])).toContain(
      'INNER JOIN specification_co_authors AS co_author',
    )
    expect(query.mock.calls[2]?.[1]).toEqual([])
    expect(query).toHaveBeenCalledTimes(3)
    expect(result).toEqual([
      {
        id: 1,
        specificationCode: 'PKG-001',
        name: 'Specification A',
        specificationGovernanceObjectTypeId: 4,
        specificationImplementationTypeId: 2,
        specificationLifecycleStatusId: 3,
        businessNeedsReference: 'Strategic need',
        responsibleHsaId: 'SE5560000001-ada1',
        responsibleDisplayName: 'Ada Admin',
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

  it('maps ordered, deduplicated relationships for multiple specifications', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        specificationCatalogRow({
          id: 2,
          name: 'Specification A',
          specificationCode: 'SPEC-002',
        }),
        specificationCatalogRow({
          id: 1,
          name: 'Specification B',
        }),
      ])
      .mockResolvedValueOnce([
        { areaId: 9, areaName: 'Alpha', specificationId: 2 },
        { areaId: 9, areaName: 'Alpha', specificationId: 2 },
        { areaId: 3, areaName: 'Zulu', specificationId: 2 },
        { areaId: 8, areaName: 'Beta', specificationId: 1 },
        { areaId: 2, areaName: 'Delta', specificationId: 1 },
      ])
      .mockResolvedValueOnce([
        { hsaId: 'SE5560000001-alpha1', specificationId: 1 },
        { hsaId: 'SE5560000001-zulu1', specificationId: 1 },
        { hsaId: 'SE5560000001-beta1', specificationId: 2 },
        { hsaId: 'SE5560000001-beta1', specificationId: 2 },
        { hsaId: 'SE5560000001-gamma1', specificationId: 2 },
      ])

    const catalog = await listSpecificationsForActorCatalog(db, {
      actorHsaId: null,
      canReadAll: true,
    })

    expect(
      catalog.specifications.map(specification => specification.id),
    ).toEqual([2, 1])
    expect(
      catalog.specifications.map(
        specification => specification.requirementAreas,
      ),
    ).toEqual([
      [
        { id: 9, name: 'Alpha' },
        { id: 3, name: 'Zulu' },
      ],
      [
        { id: 8, name: 'Beta' },
        { id: 2, name: 'Delta' },
      ],
    ])
    expect(catalog.coAuthorHsaIdsBySpecification).toEqual(
      new Map([
        [1, ['SE5560000001-alpha1', 'SE5560000001-zulu1']],
        [2, ['SE5560000001-beta1', 'SE5560000001-gamma1']],
      ]),
    )
  })

  it('reuses one actor parameter for specification areas and deduplicated co-authors', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          businessNeedsReference: null,
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          id: 1,
          itemCount: 0,
          name: 'Specification A',
          responsibleGivenName: 'Ada',
          responsibleHsaId: 'SE5560000001-ada1',
          responsibleMiddleName: null,
          responsibleSurname: 'Admin',
          specificationCode: 'SPEC-001',
          specificationGovernanceObjectTypeId: null,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: null,
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { specificationId: 1, hsaId: 'SE5560000001-ada1' },
        { specificationId: 1, hsaId: 'SE5560000001-ada1' },
      ])

    const catalog = await listSpecificationsForActorCatalog(db, {
      actorHsaId: ' SE5560000001-ada1 ',
      canReadAll: false,
    })

    expect(catalog.coAuthorHsaIdsBySpecification.get(1)).toEqual([
      'SE5560000001-ada1',
    ])
    expect(query.mock.calls).toHaveLength(3)
    expect(
      query.mock.calls.every(
        ([sql, parameters]) =>
          String(sql).includes('WITH selected_specifications AS') &&
          parameters?.length === 1 &&
          parameters[0] === 'SE5560000001-ada1',
      ),
    ).toBe(true)
  })

  it('returns an empty actor catalog without running relationship queries', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([])

    await expect(
      listSpecificationsForActorCatalog(db, {
        actorHsaId: 'SE5560000001-empty1',
        canReadAll: false,
      }),
    ).resolves.toEqual({
      coAuthorHsaIdsBySpecification: new Map(),
      specifications: [],
    })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('gets a specification by id with nested metadata', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 2,
        specificationCode: 'PKG-002',
        name: 'Specification B',
        specificationGovernanceObjectTypeId: 1,
        specificationImplementationTypeId: 5,
        specificationLifecycleStatusId: 7,
        businessNeedsReference: null,
        responsibleHsaId: 'SE5560000001-rita1',
        responsibleGivenName: 'Rita',
        responsibleMiddleName: null,
        responsibleSurname: 'Reviewer',
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
      specificationCode: 'PKG-002',
      name: 'Specification B',
      specificationGovernanceObjectTypeId: 1,
      specificationImplementationTypeId: 5,
      specificationLifecycleStatusId: 7,
      businessNeedsReference: null,
      responsibleHsaId: 'SE5560000001-rita1',
      responsibleDisplayName: 'Rita Reviewer',
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

  it('checks specification code collisions on the SQL Server path', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ id: 9 }]).mockResolvedValueOnce([])

    await expect(isSpecificationCodeTaken(db, 'PKG-009')).resolves.toBe(true)
    await expect(isSpecificationCodeTaken(db, 'PKG-009', 9)).resolves.toBe(
      false,
    )
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
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 11,
          specificationCode: 'SPEC-011',
          name: 'Specification Eleven',
          specificationGovernanceObjectTypeId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: 'Need',
          responsibleHsaId: 'SE5560000001-ada1',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-20T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([{ responsibleHsaId: 'SE5560000001-ada1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 11,
          specificationCode: 'SPEC-011',
          name: 'Specification Eleven Updated',
          specificationGovernanceObjectTypeId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: null,
          responsibleHsaId: 'SE5560000001-rita1',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 11,
          specificationCode: 'SPEC-011',
          name: 'Specification Eleven Updated',
          specificationGovernanceObjectTypeId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: null,
          responsibleHsaId: 'SE5560000001-rita1',
          responsibleGivenName: 'Rita',
          responsibleMiddleName: null,
          responsibleSurname: 'Reviewer',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([])

    const created = await createSpecification(db, {
      specificationCode: 'SPEC-011',
      name: 'Specification Eleven',
      specificationGovernanceObjectTypeId: 2,
      specificationLifecycleStatusId: 4,
      businessNeedsReference: 'Need',
      responsibleHsaId: 'SE5560000001-ada1',
      responsiblePerson: {
        email: 'ada@example.test',
        givenName: 'Ada',
        hsaId: 'SE5560000001-ada1',
        middleName: null,
        surname: 'Admin',
      },
    })
    const updated = await updateSpecification(db, 11, {
      name: 'Specification Eleven Updated',
      businessNeedsReference: null,
      responsibleHsaId: 'SE5560000001-rita1',
      responsiblePerson: {
        email: 'rita@example.test',
        givenName: 'Rita',
        hsaId: 'SE5560000001-rita1',
        middleName: null,
        surname: 'Reviewer',
      },
    })

    expect(created).toMatchObject({
      id: 11,
      specificationCode: 'SPEC-011',
      name: 'Specification Eleven',
      specificationGovernanceObjectTypeId: 2,
      specificationLifecycleStatusId: 4,
      responsibleHsaId: 'SE5560000001-ada1',
      responsibleDisplayName: 'Ada Admin',
    })
    expect(updated).toMatchObject({
      id: 11,
      name: 'Specification Eleven Updated',
      businessNeedsReference: null,
      responsibleHsaId: 'SE5560000001-rita1',
      responsibleDisplayName: 'Rita Reviewer',
    })
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('MERGE INTO requirement_responsibility_people'),
      [
        'SE5560000001-ada1',
        'Ada',
        null,
        'Admin',
        'ada@example.test',
        null,
        expect.any(Date),
      ],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO requirements_specifications'),
      [
        'SPEC-011',
        'Specification Eleven',
        2,
        null,
        4,
        'Need',
        'SE5560000001-ada1',
        expect.any(Date),
      ],
    )
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('UPDATE requirements_specifications'),
      [
        'Specification Eleven Updated',
        null,
        'SE5560000001-rita1',
        expect.any(Date),
        11,
      ],
    )
  })

  it('validates responsible HSA-id before creating a specification', async () => {
    const { db, query, transaction } = createSqlServerDb()

    await expect(
      createSpecification(db, {
        specificationCode: 'SPEC-012',
        name: 'Specification Twelve',
        specificationLifecycleStatusId: 4,
        responsibleHsaId: ' ',
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'invalid_responsible_hsa_id' },
    })

    expect(query).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('normalizes responsible HSA-ids before updating assignment fields', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ responsibleHsaId: 'SE5560000001-ada1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 11,
          specificationCode: 'SPEC-011',
          name: 'Specification Eleven',
          specificationGovernanceObjectTypeId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: null,
          responsibleHsaId: 'SE5560000001-rita1',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 11,
          specificationCode: 'SPEC-011',
          name: 'Specification Eleven',
          specificationGovernanceObjectTypeId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: null,
          responsibleHsaId: 'SE5560000001-rita1',
          responsibleGivenName: 'Rita',
          responsibleMiddleName: null,
          responsibleSurname: 'Reviewer',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([])

    const result = await updateSpecificationResponsible(db, 11, {
      responsibleHsaId: ' SE5560000001-rita1 ',
    })

    expect(transaction).toHaveBeenCalledWith('SERIALIZABLE', expect.anything())
    expect(query.mock.calls[1]?.[1]).toEqual([11, 'SE5560000001-rita1'])
    expect(query.mock.calls[2]?.[1]).toEqual([
      'SE5560000001-rita1',
      expect.any(Date),
      11,
    ])
    expect(result).toMatchObject({
      responsibleHsaId: 'SE5560000001-rita1',
      responsibleDisplayName: 'Rita Reviewer',
    })
  })

  it('rejects invalid specification co-author HSA-ids before syncing assignments', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ responsibleHsaId: 'SE5560000001-ada1' }])

    await expect(
      replaceSpecificationCoAuthors(db, 11, {
        coAuthorHsaIds: ['not-a-hsa-id'],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'invalid_responsible_hsa_id' },
    })

    expect(query).toHaveBeenCalledTimes(1)
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO specification_co_authors'),
      ),
    ).toBe(false)
  })

  it('normalizes and deduplicates specification co-author HSA-ids before persisting', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ responsibleHsaId: 'SE5560000001-ada1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await replaceSpecificationCoAuthors(db, 11, {
      coAuthorHsaIds: [' SE5560000001-coa1 ', 'SE5560000001-coa1'],
    })

    expect(result).toEqual({
      coAuthorHsaIds: ['SE5560000001-coa1'],
      specificationId: 11,
    })
    expect(query.mock.calls[2]?.[1]).toEqual([
      11,
      'SE5560000001-coa1',
      expect.any(Date),
      null,
      null,
    ])
  })

  it('rejects specification lead and co-author conflicts after normalization', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([{ responsibleHsaId: 'SE5560000001-Coa1' }])

    await expect(
      replaceSpecificationCoAuthors(db, 11, {
        coAuthorHsaIds: [' SE5560000001-coa1 '],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'specification_lead_cannot_be_co_author' },
    })

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('preserves responsible display name when partial updates omit responsibility fields', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 11,
          specificationCode: 'SPEC-011',
          name: 'Specification Eleven Updated',
          specificationGovernanceObjectTypeId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: 'Need',
          responsibleHsaId: 'SE5560000001-ada1',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 11,
          specificationCode: 'SPEC-011',
          name: 'Specification Eleven Updated',
          specificationGovernanceObjectTypeId: 2,
          specificationImplementationTypeId: null,
          specificationLifecycleStatusId: 4,
          businessNeedsReference: 'Need',
          responsibleHsaId: 'SE5560000001-ada1',
          responsibleGivenName: 'Ada',
          responsibleMiddleName: null,
          responsibleSurname: 'Admin',
          createdAt: new Date('2026-04-20T10:00:00.000Z'),
          updatedAt: new Date('2026-04-21T10:00:00.000Z'),
        },
      ])

    const updated = await updateSpecification(db, 11, {
      name: 'Specification Eleven Updated',
    })

    expect(updated).toMatchObject({
      id: 11,
      name: 'Specification Eleven Updated',
      responsibleDisplayName: 'Ada Admin',
      responsibleHsaId: 'SE5560000001-ada1',
    })
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE requirements_specifications'),
      ['Specification Eleven Updated', expect.any(Date), 11],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM requirements_specifications'),
      [11],
    )
  })

  it('deletes specification records inside a SQL Server transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValue([])

    await deleteSpecification(db, 7)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT responsible_hsa_id AS hsaId'),
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM specification_local_requirements WHERE specification_id = @0',
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM requirements_specification_items WHERE requirements_specification_id = @0',
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      4,
      'DELETE FROM specification_needs_references WHERE specification_id = @0',
      [7],
    )
    expect(query).toHaveBeenNthCalledWith(
      5,
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
          verifiable: 1,
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
          priorityLevelId: 10,
          priorityLevelCode: 'P4',
          priorityLevelColor: '#dc2626',
          priorityLevelIconName: 'ShieldAlert',
          priorityLevelNameEn: 'High',
          priorityLevelNameSv: 'Hög',
          priorityLevelSortOrder: 3,
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
      verifiable: true,
      priorityLevel: {
        code: 'P4',
        color: '#dc2626',
        iconName: 'ShieldAlert',
        id: 10,
        nameEn: 'High',
        nameSv: 'Hög',
        sortOrder: 3,
      },
      requirementPackages: [],
      uniqueId: 'LOK-001',
      updatedAt: '2026-04-21T10:00:00.000Z',
      verificationMethod: 'Manual test',
    })
  })

  it('creates and updates specification-local requirements on SQL Server', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([{ id: 11 }])
      .mockResolvedValueOnce([{ nextSequence: 2 }])
      .mockResolvedValueOnce([{ id: 41 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 41,
          specificationId: 5,
          uniqueId: 'LOK-001',
          description: 'Created local requirement',
          acceptanceCriteria: null,
          verifiable: 0,
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
          priorityLevelId: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 41, specificationId: 5, sequenceNumber: 1, uniqueId: 'LOK-001' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 41,
          specificationId: 5,
          uniqueId: 'LOK-001',
          description: 'Updated local requirement',
          acceptanceCriteria: 'Updated AC',
          verifiable: 1,
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
          priorityLevelId: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const created = await createSpecificationLocalRequirement(db, 5, {
      description: 'Created local requirement',
      normReferenceIds: [11],
    })

    const updated = await updateSpecificationLocalRequirement(db, 5, 41, {
      acceptanceCriteria: 'Updated AC',
      description: 'Updated local requirement',
      verifiable: true,
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
      verifiable: true,
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
        normReferenceIds: [13],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'normReferenceIds references unknown norm reference id 13',
      status: 400,
    })

    expect(transaction).not.toHaveBeenCalled()
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([
      expect.stringContaining('FROM norm_references'),
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

  it('preserves specification-local verifiability fields when update omits them', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          id: 41,
          verifiable: 1,
          sequenceNumber: 1,
          specificationId: 5,
          uniqueId: 'LOK-001',
          verificationMethod: 'Checklist',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 41,
          specificationId: 5,
          uniqueId: 'LOK-001',
          description: 'Updated local requirement',
          acceptanceCriteria: null,
          verifiable: 1,
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
          priorityLevelId: null,
        },
      ])
      .mockResolvedValueOnce([])

    const updated = await updateSpecificationLocalRequirement(db, 5, 41, {
      description: 'Updated local requirement',
    })

    const updateCall = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE specification_local_requirements'),
    )
    expect(updateCall?.[1]?.at(6)).toBe(1)
    expect(updateCall?.[1]?.at(8)).toBe('Checklist')
    expect(updated).toMatchObject({
      verifiable: true,
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
          verifiable: 1,
          priorityLevelId: 2,
          specificationId: 5,
          specificationItemStatusId: 1,
          uniqueId: 'KRAV0001',
          verificationMethod: 'Inspection',
        },
      ])
      .mockResolvedValueOnce([{ normReferenceId: 11 }])
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
      3,
      expect.stringContaining('UPDATE requirement_areas'),
      [8],
    )
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO requirements'),
      ['SEC0009', 8, 9, expect.any(Date)],
    )
    expect(query).toHaveBeenNthCalledWith(
      5,
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
      6,
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

  it('graduates a non-Included specification-local requirement as a draft library copy', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          acceptanceCriteria: null,
          description: 'Local description',
          id: 41,
          qualityCharacteristicId: null,
          requirementCategoryId: null,
          requirementTypeId: null,
          verifiable: 0,
          priorityLevelId: null,
          specificationId: 5,
          uniqueId: 'KRAV0001',
          verificationMethod: null,
        },
      ])
      .mockResolvedValueOnce([])
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
    expect(
      query.mock.calls.some(([sql]) =>
        /DELETE FROM specification_local_requirements|UPDATE specification_local_requirements/i.test(
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

  it('lists traceability report items in requested ref order on the SQL Server path', async () => {
    const { db, query } = createSqlServerDb()
    query
      .mockResolvedValueOnce([
        {
          areaName: 'Security',
          deviationApproved: 1,
          deviationPending: 1,
          deviationRejected: 1,
          deviationTotal: 3,
          itemId: 31,
          needsReference: 'IAM-42',
          note: 'Library note',
          verifiable: 1,
          priorityLevelNameEn: 'High',
          priorityLevelNameSv: 'Hög',
          specificationItemStatusId: 2,
          specificationItemStatusNameEn: 'In progress',
          specificationItemStatusNameSv: 'Pågår',
          statusUpdatedAt: new Date('2026-06-03T10:00:00.000Z'),
          uniqueId: 'REQ-001',
          verificationMethod: 'Review evidence',
          versionNumber: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          areaName: null,
          deviationApproved: 0,
          deviationPending: 0,
          deviationRejected: 0,
          deviationTotal: 0,
          itemId: 41,
          needsReference: null,
          note: 'Local note',
          verifiable: 0,
          priorityLevelNameEn: null,
          priorityLevelNameSv: null,
          specificationItemStatusId: 1,
          specificationItemStatusNameEn: 'Not started',
          specificationItemStatusNameSv: 'Ej startad',
          statusUpdatedAt: '2026-06-04T10:00:00.000Z',
          uniqueId: 'KRAV0001',
          verificationMethod: null,
        },
      ])

    const result = await listSpecificationTraceabilityItems(db, 5, [
      'local:41',
      'lib:31',
    ])

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'FROM requirements_specification_items specification_item',
      ),
      [5, 1, 2, 31],
    )
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'FROM specification_local_requirements local_requirement',
      ),
      [5, 1, 2, 41],
    )
    expect(query.mock.calls[0]?.[0]).toContain(
      'WHERE deviation.specification_item_id IN (@3)',
    )
    expect(query.mock.calls[1]?.[0]).toContain(
      'WHERE deviation.specification_local_requirement_id IN (@3)',
    )
    expect(result).toEqual([
      expect.objectContaining({
        deviationCounts: { approved: 0, pending: 0, rejected: 0, total: 0 },
        itemRef: 'local:41',
        kind: 'specificationLocal',
        note: 'Local note',
        verifiable: false,
        statusUpdatedAt: '2026-06-04T10:00:00.000Z',
        uniqueId: 'KRAV0001',
        versionNumber: null,
      }),
      expect.objectContaining({
        deviationCounts: { approved: 1, pending: 1, rejected: 1, total: 3 },
        itemRef: 'lib:31',
        kind: 'library',
        needsReference: 'IAM-42',
        verifiable: true,
        statusUpdatedAt: '2026-06-03T10:00:00.000Z',
        uniqueId: 'REQ-001',
        verificationMethod: 'Review evidence',
        versionNumber: 2,
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
