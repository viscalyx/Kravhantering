import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError } from '@/lib/requirements/errors'

const mockDb = {}
const mocks = vi.hoisted(() => ({
  countLinkedRequirements: vi.fn(),
  createRequirementsRuntime: vi.fn(),
  createServerComponentRequestContext: vi.fn(),
  getAvailableSpecificationRequirements: vi.fn(),
  getAiGenerationAvailability: vi.fn(),
  getSpecificationItems: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getSpecificationByCode: vi.fn(),
  getSpecificationForbiddenSummaryById: vi.fn(),
  getSpecificationById: vi.fn(),
  listAreas: vi.fn(),
  listNormReferences: vi.fn(),
  listRequirementPackages: vi.fn(),
  listSpecificationCoAuthorHsaIds: vi.fn(),
  listSpecificationGovernanceObjectTypes: vi.fn(),
  listSpecificationImplementationTypes: vi.fn(),
  listSpecificationItemStatuses: vi.fn(),
  listSpecificationLifecycleStatuses: vi.fn(),
  listSpecificationNeedsReferences: vi.fn(),
  listSpecificationsForActorCatalog: vi.fn(),
  querySpecificationRequirementPackagePage: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(
    async ({ locale }: { locale: 'en' | 'sv'; namespace: string }) =>
      (key: string) => {
        if (key !== 'partialDataLoadWarning') return key
        return locale === 'sv'
          ? 'Vissa underlagsdata kunde inte läsas in. Befintliga data visas fortfarande där de finns.'
          : 'Some specification data could not be loaded. Existing data is still shown where available.'
      },
  ),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/requirements-specifications', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('@/lib/dal/requirements-specifications')
    >()
  return {
    ...actual,
    getSpecificationByCode: mocks.getSpecificationByCode,
    getSpecificationForbiddenSummaryById:
      mocks.getSpecificationForbiddenSummaryById,
    getSpecificationById: mocks.getSpecificationById,
    listSpecificationCoAuthorHsaIds: mocks.listSpecificationCoAuthorHsaIds,
    listSpecificationNeedsReferences: mocks.listSpecificationNeedsReferences,
    listSpecificationsForActorCatalog: mocks.listSpecificationsForActorCatalog,
  }
})

vi.mock('@/lib/dal/ai-settings', () => ({
  getAiGenerationAvailability: mocks.getAiGenerationAvailability,
}))

vi.mock('@/lib/dal/norm-references', () => ({
  countLinkedRequirements: mocks.countLinkedRequirements,
  listNormReferences: mocks.listNormReferences,
}))

vi.mock('@/lib/dal/requirement-areas', () => ({ listAreas: mocks.listAreas }))

vi.mock('@/lib/dal/requirement-packages', () => ({
  listRequirementPackages: mocks.listRequirementPackages,
}))

vi.mock('@/lib/dal/specification-governance-object-types', () => ({
  listSpecificationGovernanceObjectTypes:
    mocks.listSpecificationGovernanceObjectTypes,
}))

vi.mock('@/lib/dal/specification-implementation-types', () => ({
  listSpecificationImplementationTypes:
    mocks.listSpecificationImplementationTypes,
}))

vi.mock('@/lib/dal/specification-item-statuses', () => ({
  listSpecificationItemStatuses: mocks.listSpecificationItemStatuses,
}))

vi.mock('@/lib/dal/specification-lifecycle-statuses', () => ({
  listSpecificationLifecycleStatuses: mocks.listSpecificationLifecycleStatuses,
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRuntime: mocks.createRequirementsRuntime,
}))

vi.mock('@/lib/requirements/server-component-context', () => ({
  createServerComponentRequestContext:
    mocks.createServerComponentRequestContext,
}))

vi.mock('@/lib/requirements/specification-requirement-packages', () => ({
  DEFAULT_SPECIFICATION_REQUIREMENT_PACKAGE_PAGE_LIMIT: 50,
  querySpecificationRequirementPackagePage:
    mocks.querySpecificationRequirementPackagePage,
}))

import {
  loadRequirementsSpecificationDetailInitialData,
  loadRequirementsSpecificationsInitialData,
  resolveRequirementsSpecificationRouteParam,
} from '@/lib/specifications/preload'

describe('specifications preload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRequestSqlServerDataSource.mockResolvedValue(mockDb)
    mocks.getSpecificationByCode.mockResolvedValue(null)
    mocks.getSpecificationById.mockResolvedValue({ id: 42 })
    mocks.getSpecificationForbiddenSummaryById.mockResolvedValue(null)
    mocks.listSpecificationCoAuthorHsaIds.mockResolvedValue([])
    mocks.createServerComponentRequestContext.mockResolvedValue({
      actor: {
        hsaId: 'SE5560000001-owner',
        isAuthenticated: true,
        roles: [],
      },
      source: 'rest',
    })
    mocks.createRequirementsRuntime.mockReturnValue({
      authorization: { assertAuthorized: vi.fn() },
      service: {
        getAvailableSpecificationRequirements:
          mocks.getAvailableSpecificationRequirements,
        getSpecificationItems: mocks.getSpecificationItems,
      },
    })
    mocks.getSpecificationItems.mockResolvedValue({
      items: [{ itemRef: 'lib:1' }],
      pagination: { count: 1, hasMore: false, limit: 50, nextCursor: null },
    })
    mocks.getAiGenerationAvailability.mockResolvedValue({
      available: true,
      reason: null,
    })
    mocks.listAreas.mockResolvedValue([{ id: 1, name: 'Security' }])
    mocks.listRequirementPackages.mockResolvedValue([
      { id: 2, name: 'Package', purposeAndScope: 'Scope' },
    ])
    mocks.listSpecificationNeedsReferences.mockResolvedValue([
      { id: 3, text: 'Business need' },
    ])
    mocks.listSpecificationGovernanceObjectTypes.mockResolvedValue([
      { id: 4, nameEn: 'Service', nameSv: 'Tjanst' },
    ])
    mocks.listSpecificationImplementationTypes.mockResolvedValue([
      { id: 5, nameEn: 'Contract', nameSv: 'Avtal' },
    ])
    mocks.listSpecificationLifecycleStatuses.mockResolvedValue([
      { id: 6, nameEn: 'Draft', nameSv: 'Utkast' },
    ])
    mocks.listSpecificationItemStatuses.mockResolvedValue([
      { id: 1, nameEn: 'Active', nameSv: 'Aktiv' },
      { id: 5, nameEn: 'Deviated', nameSv: 'Avviken' },
    ])
    mocks.getAvailableSpecificationRequirements.mockResolvedValue({
      pagination: {
        count: 1,
        hasMore: true,
        limit: 200,
        nextCursor: 'next',
      },
      requirements: [{ id: 7, uniqueId: 'REQ-7' }],
      selectionFilter: {
        applied: false,
        hasCurrentAnswers: true,
        hasNoRequirementSelection: false,
        hasRequirementSelection: true,
        requirementIds: [7],
      },
    })
    mocks.querySpecificationRequirementPackagePage.mockResolvedValue({
      pagination: { count: 1, hasMore: false, limit: 50, nextCursor: null },
      requirementPackages: [{ id: 2, name: 'Package' }],
      selectedRequirementPackages: [{ id: 2, name: 'Package' }],
    })
    mocks.listNormReferences.mockResolvedValue([
      { id: 8, name: 'ISO 1', normReferenceId: 'ISO-1' },
      { id: 9, name: 'Unused', normReferenceId: 'ISO-2' },
    ])
    mocks.countLinkedRequirements.mockResolvedValue({ 8: 2 })
    mocks.listSpecificationsForActorCatalog.mockResolvedValue({
      coAuthorHsaIdsBySpecification: new Map([[10, ['SE5560000001-owner']]]),
      specifications: [
        {
          id: 10,
          name: 'Specification',
          responsibleHsaId: 'SE5560000001-other',
        },
        {
          id: 11,
          name: 'Owned specification',
          responsibleHsaId: 'SE5560000001-owner',
        },
      ],
    })
  })

  it('resolves canonical numeric specification route params by id', async () => {
    await expect(
      resolveRequirementsSpecificationRouteParam('42'),
    ).resolves.toEqual({
      fromCode: false,
      id: 42,
    })
    expect(mocks.getSpecificationById).toHaveBeenCalledWith(mockDb, 42)
    expect(mocks.getSpecificationByCode).not.toHaveBeenCalled()
  })

  it('rejects oversized numeric route params before converting to Number', async () => {
    await expect(
      resolveRequirementsSpecificationRouteParam('2147483648'),
    ).resolves.toBeNull()
    expect(mocks.getSpecificationById).not.toHaveBeenCalled()
    expect(mocks.getSpecificationByCode).not.toHaveBeenCalled()
  })

  it('resolves nonnumeric route params by specification code', async () => {
    mocks.getSpecificationByCode.mockResolvedValueOnce({ id: 9 })

    await expect(
      resolveRequirementsSpecificationRouteParam('ETJANST-UPP-2026'),
    ).resolves.toEqual({
      fromCode: true,
      id: 9,
    })
    expect(mocks.getSpecificationByCode).toHaveBeenCalledWith(
      mockDb,
      'ETJANST-UPP-2026',
    )
    expect(mocks.getSpecificationById).not.toHaveBeenCalled()
  })

  it('returns null when a canonical id or code does not identify a specification', async () => {
    mocks.getSpecificationById.mockResolvedValueOnce(null)

    await expect(
      resolveRequirementsSpecificationRouteParam('42'),
    ).resolves.toBeNull()
    await expect(
      resolveRequirementsSpecificationRouteParam('MISSING'),
    ).resolves.toBeNull()
  })

  it('preloads the complete observable specification workspace', async () => {
    mocks.getSpecificationById.mockResolvedValueOnce({
      id: 42,
      name: 'Specification',
      responsibleHsaId: 'SE5560000001-owner',
    })

    const data = await loadRequirementsSpecificationDetailInitialData({
      locale: 'en',
      specificationId: 42,
    })

    expect(data.errors).toEqual([])
    expect(data.spec).toMatchObject({
      id: 42,
      permissions: { canEditContent: true, canManageAssignments: true },
    })
    expect(data.areas).toEqual([{ id: 1, name: 'Security' }])
    expect(data.availableRequirements).toMatchObject({
      hasMore: true,
      nextCursor: 'next',
      rows: [{ id: 7, uniqueId: 'REQ-7' }],
      selectionFilter: {
        applied: false,
        hasCurrentAnswers: true,
        hasNoRequirementSelection: false,
        hasRequirementSelection: true,
        requirementIds: [7],
      },
    })
    expect(data.leftNormReferenceOptions).toEqual([
      { id: 8, name: 'ISO 1', normReferenceId: 'ISO-1' },
    ])
    expect(data.rightNormReferenceOptions).toEqual([
      { id: 8, name: 'ISO 1', normReferenceId: 'ISO-1' },
    ])
    expect(mocks.countLinkedRequirements).toHaveBeenCalledWith(mockDb, {
      statuses: [3],
    })
    expect(data.specificationItemStatuses).toEqual([
      expect.objectContaining({ id: 1, isDeviationStatus: false }),
      expect.objectContaining({ id: 5, isDeviationStatus: true }),
    ])
  })

  it('returns a not-found preload shell when specification lookup fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.getSpecificationById.mockRejectedValueOnce(
      new Error(
        'SELECT client_secret FROM auth_configuration for NO5560000001-owner',
      ),
    )

    try {
      const data = await loadRequirementsSpecificationDetailInitialData({
        locale: 'sv',
        specificationId: 404,
      })

      expect(data.notFound).toBe(true)
      expect(data.spec).toBeNull()
      expect(data.errors).toEqual([
        {
          key: 'specification',
          message:
            'Vissa underlagsdata kunde inte läsas in. Befintliga data visas fortfarande där de finns.',
        },
      ])
      const serializedData = JSON.stringify(data)
      expect(serializedData).not.toMatch(
        /SELECT|client_secret|auth_configuration|NO5560000001-owner/,
      )
      expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toMatch(
        /SELECT client_secret|NO5560000001-owner/,
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('returns assignment guidance when the shared read denies preload access', async () => {
    mocks.getSpecificationById.mockResolvedValueOnce({
      id: 42,
      name: 'Specification',
      responsibleHsaId: 'SE5560000001-other',
    })
    mocks.getSpecificationForbiddenSummaryById.mockResolvedValueOnce({
      name: 'Specification',
      responsible: { displayName: 'Owner' },
      specificationCode: 'SPEC-42',
    })
    mocks.getAvailableSpecificationRequirements.mockRejectedValueOnce(
      forbiddenError('Specification read denied'),
    )

    const data = await loadRequirementsSpecificationDetailInitialData({
      locale: 'en',
      specificationId: 42,
    })

    expect(data.forbidden).toEqual({
      responsible: { displayName: 'Owner' },
      specification: { name: 'Specification', specificationCode: 'SPEC-42' },
    })
    expect(mocks.listAreas).toHaveBeenCalled()
    expect(data.areas).toEqual([])
  })

  it('returns a forbidden shell without disclosing missing summary data', async () => {
    mocks.getSpecificationById.mockResolvedValueOnce({
      id: 42,
      name: 'Specification',
      responsibleHsaId: 'SE5560000001-other',
    })
    mocks.getAvailableSpecificationRequirements.mockRejectedValueOnce(
      forbiddenError('Specification read denied'),
    )

    const data = await loadRequirementsSpecificationDetailInitialData({
      locale: 'en',
      specificationId: 42,
    })

    expect(data.forbidden).toBeUndefined()
    expect(data.spec).toBeNull()
  })

  it('keeps the detail shell usable when independently loaded resources fail', async () => {
    mocks.getSpecificationById.mockResolvedValueOnce({
      id: 42,
      name: 'Specification',
      responsibleHsaId: 'SE5560000001-owner',
    })
    mocks.getAiGenerationAvailability.mockRejectedValueOnce(
      new Error('raw-ai-failure'),
    )
    mocks.listAreas.mockRejectedValueOnce(new Error('raw-areas-failure'))
    mocks.listRequirementPackages.mockRejectedValueOnce(
      new Error('raw-packages-failure'),
    )
    mocks.listSpecificationNeedsReferences.mockRejectedValueOnce(
      new Error('raw-needs-failure'),
    )
    mocks.listSpecificationGovernanceObjectTypes.mockRejectedValueOnce(
      new Error('raw-governance-failure'),
    )
    mocks.listSpecificationImplementationTypes.mockRejectedValueOnce(
      new Error('raw-implementation-failure'),
    )
    mocks.listSpecificationLifecycleStatuses.mockRejectedValueOnce(
      new Error('raw-lifecycle-failure'),
    )
    mocks.listSpecificationItemStatuses.mockRejectedValueOnce(
      new Error('raw-statuses-failure'),
    )
    mocks.getSpecificationItems.mockRejectedValueOnce(
      new Error('raw-items-failure'),
    )
    mocks.getAvailableSpecificationRequirements.mockRejectedValueOnce(
      new Error('raw-available-failure'),
    )
    mocks.querySpecificationRequirementPackagePage.mockRejectedValueOnce(
      new Error('raw-package-catalog-failure'),
    )
    mocks.listNormReferences.mockRejectedValue(new Error('raw-norms-failure'))

    const data = await loadRequirementsSpecificationDetailInitialData({
      locale: 'en',
      specificationId: 42,
    })

    expect(data.spec?.id).toBe(42)
    expect(new Set(data.errors.map(error => error.message))).toEqual(
      new Set([
        'Some specification data could not be loaded. Existing data is still shown where available.',
      ]),
    )
    expect(JSON.stringify(data)).not.toMatch(
      /raw-(?:ai|areas|packages|needs|governance|implementation|lifecycle|statuses|items|available|package-catalog|norms)-failure/,
    )
    expect(data.availableRequirements.rows).toEqual([])
    expect(data.specificationItems.items).toEqual([])
  })

  it('preloads the visible specification catalog with row permissions', async () => {
    const data = await loadRequirementsSpecificationsInitialData('en')

    expect(data.collectionPermissions?.canCreateSpecification).toBe(true)
    expect(data.specifications).toEqual([
      expect.objectContaining({
        id: 10,
        permissions: expect.objectContaining({ canEditContent: true }),
      }),
      expect.objectContaining({
        id: 11,
        permissions: expect.objectContaining({ canEditContent: true }),
      }),
    ])
    expect(data.governanceObjectTypes).toHaveLength(1)
    expect(data.implementationTypes).toHaveLength(1)
    expect(data.lifecycleStatuses).toHaveLength(1)
  })

  it('returns independent catalog fallbacks and errors when preload calls fail', async () => {
    mocks.listSpecificationsForActorCatalog.mockRejectedValueOnce(
      new Error('specifications'),
    )
    mocks.listSpecificationGovernanceObjectTypes.mockRejectedValueOnce(
      new Error('governance'),
    )
    mocks.listSpecificationImplementationTypes.mockRejectedValueOnce(
      new Error('implementation'),
    )
    mocks.listSpecificationLifecycleStatuses.mockRejectedValueOnce(
      new Error('lifecycle'),
    )

    const data = await loadRequirementsSpecificationsInitialData('en')

    expect(data.specifications).toEqual([])
    expect(data.governanceObjectTypes).toEqual([])
    expect(data.implementationTypes).toEqual([])
    expect(data.lifecycleStatuses).toEqual([])
    expect(data.errors.map(error => error.message)).toEqual(
      Array(4).fill(
        'Some specification data could not be loaded. Existing data is still shown where available.',
      ),
    )
    expect(JSON.stringify(data)).not.toMatch(
      /"message":"(?:specifications|governance|implementation|lifecycle)"/,
    )
  })
})
