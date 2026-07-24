'use client'

import { useMemo } from 'react'
import {
  type AsyncResourceState,
  useAsyncResource,
} from '@/hooks/useAsyncResource'
import { apiFetch } from '@/lib/http/api-fetch'

export interface TaxonomyOption {
  id: number
  nameEn: string
  nameSv: string
}

export interface PriorityLevelOption extends TaxonomyOption {
  assessmentCriteriaEn: string
  assessmentCriteriaSv: string
  code: string
  color: string
  descriptionEn: string
  descriptionSv: string
  iconName: string | null
}

export interface AreaOption {
  id: number
  name: string
  ownerHsaId: string
}

export interface QualityCharacteristicOption {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
}

export interface RequirementPackageOption {
  id: number
  isArchived?: boolean
  name: string
  purposeAndScope?: string | null
}

export interface NormReferenceOption {
  id: number
  isArchived?: boolean
  name: string
  normReferenceId: string
}

export type ReferenceDataCatalog =
  | 'areas'
  | 'categories'
  | 'needsReferences'
  | 'normReferences'
  | 'priorityLevels'
  | 'qualityCharacteristics'
  | 'requirementPackages'
  | 'types'

export interface ReferenceDataReadiness {
  canSave: boolean
  emptyRequiredCatalogs: ReferenceDataCatalog[]
  failedCatalogs: ReferenceDataCatalog[]
  loadingCatalogs: ReferenceDataCatalog[]
  refreshFailedCatalogs: ReferenceDataCatalog[]
  refreshingCatalogs: ReferenceDataCatalog[]
  retryFailed: () => Promise<void>
}

export interface TaxonomyOptions {
  areas: AreaOption[]
  categories: TaxonomyOption[]
  loading: boolean
  normReferences: NormReferenceOption[]
  priorityLevels: PriorityLevelOption[]
  qualityCharacteristics: QualityCharacteristicOption[]
  readiness: ReferenceDataReadiness
  refresh: () => Promise<void>
  requirementPackages: RequirementPackageOption[]
  types: TaxonomyOption[]
}

interface UseTaxonomyOptionsOptions {
  selectedRequirementPackageIds?: number[]
  variant?: 'library' | 'specificationLocal'
}

export interface ReferenceDataResourceDescriptor {
  catalog: ReferenceDataCatalog
  requireNonEmpty?: boolean
  resource: AsyncResourceState<unknown>
}

const EMPTY_SELECTED_IDS: number[] = []

function normalizeSelectedIds(ids: number[]): number[] {
  return [...new Set(ids)]
    .filter(id => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right)
}

function selectedIdsKey(ids: number[]): string {
  return normalizeSelectedIds(ids).join(',')
}

function buildIncludeIdsUrl(path: string, selectedIds: number[]): string {
  const ids = normalizeSelectedIds(selectedIds)
  if (ids.length === 0) return path
  const params = new URLSearchParams()
  for (const id of ids) {
    params.append('includeIds', String(id))
  }
  return `${path}?${params.toString()}`
}

async function readCatalog<T>(
  response: Response,
  property: string,
): Promise<T[]> {
  if (!response.ok) {
    throw new Error('Reference data request failed')
  }
  const body = (await response.json()) as Record<string, unknown>
  const value = body[property]
  return Array.isArray(value) ? (value as T[]) : []
}

function asDescriptor<T>(
  catalog: ReferenceDataCatalog,
  resource: AsyncResourceState<T>,
): ReferenceDataResourceDescriptor {
  return {
    catalog,
    resource: resource as AsyncResourceState<unknown>,
  }
}

export function createReferenceDataReadiness(
  resources: ReferenceDataResourceDescriptor[],
): ReferenceDataReadiness {
  const emptyRequiredCatalogs = resources
    .filter(
      ({ requireNonEmpty, resource }) =>
        requireNonEmpty === true &&
        Array.isArray(resource.data) &&
        resource.data.length === 0,
    )
    .map(({ catalog }) => catalog)
  const failedCatalogs = resources
    .filter(({ resource }) => resource.data === undefined && resource.error)
    .map(({ catalog }) => catalog)
  const loadingCatalogs = resources
    .filter(({ resource }) => resource.data === undefined && resource.loading)
    .map(({ catalog }) => catalog)
  const refreshingCatalogs = resources
    .filter(({ resource }) => resource.refreshing)
    .map(({ catalog }) => catalog)
  const refreshFailedCatalogs = resources
    .filter(
      ({ resource }) =>
        resource.data !== undefined && resource.refreshError !== null,
    )
    .map(({ catalog }) => catalog)
  const failedResources = resources.filter(
    ({ requireNonEmpty, resource }) =>
      resource.error !== null ||
      resource.refreshError !== null ||
      (requireNonEmpty === true &&
        Array.isArray(resource.data) &&
        resource.data.length === 0),
  )

  return {
    canSave:
      emptyRequiredCatalogs.length === 0 &&
      resources.every(({ resource }) => resource.data !== undefined),
    emptyRequiredCatalogs,
    failedCatalogs,
    loadingCatalogs,
    refreshingCatalogs,
    refreshFailedCatalogs,
    retryFailed: async () => {
      await Promise.all(
        failedResources.map(({ resource }) => resource.reload()),
      )
    },
  }
}

export function mergeReferenceDataReadiness(
  ...states: ReferenceDataReadiness[]
): ReferenceDataReadiness {
  return {
    canSave: states.every(state => state.canSave),
    emptyRequiredCatalogs: states.flatMap(state => state.emptyRequiredCatalogs),
    failedCatalogs: states.flatMap(state => state.failedCatalogs),
    loadingCatalogs: states.flatMap(state => state.loadingCatalogs),
    refreshingCatalogs: states.flatMap(state => state.refreshingCatalogs),
    refreshFailedCatalogs: states.flatMap(state => state.refreshFailedCatalogs),
    retryFailed: async () => {
      await Promise.all(states.map(state => state.retryFailed()))
    },
  }
}

export function useTaxonomyOptions(
  typeId: string,
  selectedNormReferenceIds: number[] = EMPTY_SELECTED_IDS,
  options: UseTaxonomyOptionsOptions = {},
): TaxonomyOptions {
  const variant = options.variant ?? 'library'
  const selectedRequirementPackageIds =
    options.selectedRequirementPackageIds ?? EMPTY_SELECTED_IDS
  const includeLibraryCatalogs = variant === 'library'
  const normReferenceIdsKey = selectedIdsKey(selectedNormReferenceIds)
  const requirementPackageIdsKey = selectedIdsKey(selectedRequirementPackageIds)
  const normalizedTypeId = /^\d+$/.test(typeId) ? typeId : ''

  const areasResource = useAsyncResource<AreaOption[]>({
    enabled: includeLibraryCatalogs,
    fetcher: async signal =>
      readCatalog<AreaOption>(
        await apiFetch('/api/requirement-areas', { signal }),
        'areas',
      ),
    getErrorMessage: () => 'areas',
    key: 'requirement-form:areas',
  })
  const categoriesResource = useAsyncResource<TaxonomyOption[]>({
    fetcher: async signal =>
      readCatalog<TaxonomyOption>(
        await apiFetch('/api/requirement-categories', { signal }),
        'categories',
      ),
    getErrorMessage: () => 'categories',
    key: 'requirement-form:categories',
  })
  const typesResource = useAsyncResource<TaxonomyOption[]>({
    fetcher: async signal =>
      readCatalog<TaxonomyOption>(
        await apiFetch('/api/requirement-types', { signal }),
        'types',
      ),
    getErrorMessage: () => 'types',
    key: 'requirement-form:types',
  })
  const requirementPackagesResource = useAsyncResource<
    RequirementPackageOption[]
  >({
    enabled: includeLibraryCatalogs,
    fetcher: async signal =>
      readCatalog<RequirementPackageOption>(
        await apiFetch(
          buildIncludeIdsUrl(
            '/api/requirement-packages',
            selectedRequirementPackageIds,
          ),
          { signal },
        ),
        'requirementPackages',
      ),
    getErrorMessage: () => 'requirementPackages',
    key: `requirement-form:requirement-packages:${requirementPackageIdsKey}`,
  })
  const normReferencesResource = useAsyncResource<NormReferenceOption[]>({
    fetcher: async signal =>
      readCatalog<NormReferenceOption>(
        await apiFetch(
          buildIncludeIdsUrl('/api/norm-references', selectedNormReferenceIds),
          { signal },
        ),
        'normReferences',
      ),
    getErrorMessage: () => 'normReferences',
    key: `requirement-form:norm-references:${normReferenceIdsKey}`,
  })
  const priorityLevelsResource = useAsyncResource<PriorityLevelOption[]>({
    fetcher: async signal =>
      readCatalog<PriorityLevelOption>(
        await apiFetch('/api/priority-levels', { signal }),
        'priorityLevels',
      ),
    getErrorMessage: () => 'priorityLevels',
    key: 'requirement-form:priority-levels',
  })
  const qualityCharacteristicsResource = useAsyncResource<
    QualityCharacteristicOption[]
  >({
    enabled: normalizedTypeId.length > 0,
    fetcher: async signal => {
      const params = new URLSearchParams({ typeId: normalizedTypeId })
      return readCatalog<QualityCharacteristicOption>(
        await apiFetch(`/api/quality-characteristics?${params.toString()}`, {
          signal,
        }),
        'qualityCharacteristics',
      )
    },
    getErrorMessage: () => 'qualityCharacteristics',
    key: `requirement-form:quality-characteristics:${normalizedTypeId || 'none'}`,
  })

  const resources = useMemo(() => {
    const descriptors = [
      asDescriptor('categories', categoriesResource),
      asDescriptor('types', typesResource),
      asDescriptor('normReferences', normReferencesResource),
      asDescriptor('priorityLevels', priorityLevelsResource),
    ]
    if (includeLibraryCatalogs) {
      descriptors.push(
        {
          ...asDescriptor('areas', areasResource),
          requireNonEmpty: true,
        },
        asDescriptor('requirementPackages', requirementPackagesResource),
      )
    }
    if (normalizedTypeId) {
      descriptors.push(
        asDescriptor('qualityCharacteristics', qualityCharacteristicsResource),
      )
    }
    return descriptors
  }, [
    areasResource,
    categoriesResource,
    includeLibraryCatalogs,
    normReferencesResource,
    normalizedTypeId,
    priorityLevelsResource,
    qualityCharacteristicsResource,
    requirementPackagesResource,
    typesResource,
  ])

  const readiness = createReferenceDataReadiness(resources)

  return {
    areas: areasResource.data ?? [],
    categories: categoriesResource.data ?? [],
    loading: readiness.loadingCatalogs.length > 0,
    normReferences: normReferencesResource.data ?? [],
    priorityLevels: priorityLevelsResource.data ?? [],
    qualityCharacteristics: qualityCharacteristicsResource.data ?? [],
    readiness,
    refresh: async () => {
      await Promise.all(resources.map(({ resource }) => resource.reload()))
    },
    requirementPackages: requirementPackagesResource.data ?? [],
    types: typesResource.data ?? [],
  }
}
