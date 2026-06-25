import { countDeviationsPerItemRef } from '@/lib/dal/deviations'
import {
  countLinkedRequirements,
  listNormReferences,
} from '@/lib/dal/norm-references'
import { listAreas } from '@/lib/dal/requirement-areas'
import { listRequirementPackages } from '@/lib/dal/requirement-packages'
import {
  getSpecificationBySlug,
  getSpecificationForbiddenSummaryBySlug,
  listSpecificationCoAuthorHsaIds,
  listSpecificationCoAuthorHsaIdsBySpecification,
  listSpecificationItems,
  listSpecificationNeedsReferences,
  listSpecificationsForActor,
} from '@/lib/dal/requirements-specifications'
import { listSpecificationGovernanceObjectTypes } from '@/lib/dal/specification-governance-object-types'
import { listSpecificationImplementationTypes } from '@/lib/dal/specification-implementation-types'
import { listSpecificationItemStatuses } from '@/lib/dal/specification-item-statuses'
import { listSpecificationLifecycleStatuses } from '@/lib/dal/specification-lifecycle-statuses'
import type { SqlServerDatabase } from '@/lib/db'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { forbiddenError } from '@/lib/requirements/errors'
import { queryRequirementList } from '@/lib/requirements/list-query'
import {
  type AreaOption,
  DEFAULT_REQUIREMENT_SORT,
  type RequirementPackageOption,
  type RequirementRow,
  type SpecificationItemStatusOption,
} from '@/lib/requirements/list-view'
import { recordAuthorizationDenied } from '@/lib/requirements/security-audit'
import { createServerComponentRequestContext } from '@/lib/requirements/server-component-context'
import { DEVIATED_SPECIFICATION_ITEM_STATUS_ID } from '@/lib/specification-item-status-constants'
import {
  canCreateSpecification,
  canReadAllSpecifications,
  canReadSpecification,
  specificationPermissions,
} from '@/lib/specifications/permissions'
import type {
  NormReferenceOption,
  RequirementsSpecificationDetailInitialData,
  RequirementsSpecificationsInitialData,
  Specification,
  SpecificationListItem,
  SpecificationMeta,
  SpecificationNeedsReference,
  SpecificationPreloadError,
  SpecificationTaxonomyItem,
} from '@/lib/specifications/preload-types'

const PAGE_SIZE = 200

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function capture<T>(
  key: string,
  fallback: T,
  load: () => Promise<T>,
): Promise<{ error?: SpecificationPreloadError; value: T }> {
  try {
    return { value: await load() }
  } catch (error) {
    console.error(`Failed to preload ${key}`, error)
    return {
      error: { key, message: toErrorMessage(error) },
      value: fallback,
    }
  }
}

async function listLinkedNormReferenceOptions(
  db: SqlServerDatabase,
  statuses?: number[],
): Promise<NormReferenceOption[]> {
  const [normReferences, counts] = await Promise.all([
    listNormReferences(db),
    countLinkedRequirements(db, statuses?.length ? { statuses } : undefined),
  ])

  return normReferences
    .map(reference => ({
      id: reference.id,
      linkedRequirementCount: counts[reference.id] ?? 0,
      name: reference.name,
      normReferenceId: reference.normReferenceId,
    }))
    .filter(reference => reference.linkedRequirementCount > 0)
    .map(
      ({ linkedRequirementCount: _linkedRequirementCount, ...reference }) =>
        reference,
    )
}

async function listSpecificationItemStatusOptions(
  db: SqlServerDatabase,
): Promise<SpecificationItemStatusOption[]> {
  const statuses = await listSpecificationItemStatuses(db)
  return statuses.map(status => ({
    ...status,
    isDeviationStatus: status.id === DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
  }))
}

async function loadAvailableRequirements(
  db: SqlServerDatabase,
  locale: 'en' | 'sv',
): Promise<
  RequirementsSpecificationDetailInitialData['availableRequirements']
> {
  const result = await queryRequirementList(
    db,
    {
      filters: { statuses: [3] },
      limit: PAGE_SIZE,
      locale,
      sort: DEFAULT_REQUIREMENT_SORT,
    },
    { allowUnauthenticated: true },
  )
  return {
    hasMore: result.pagination.hasMore,
    rows: result.requirements as RequirementRow[],
  }
}

async function loadSpecificationItems(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<SpecificationListItem[]> {
  const items = await listSpecificationItems(db, specificationId)
  const deviationCounts = await countDeviationsPerItemRef(db, specificationId)

  return items.map(item => {
    const counts = item.itemRef ? deviationCounts.get(item.itemRef) : undefined
    return {
      ...item,
      deviationCount: counts?.total ?? 0,
      hasApprovedDeviation: (counts?.approved ?? 0) > 0,
      hasPendingDeviation: (counts?.pending ?? 0) > 0,
    }
  }) as SpecificationListItem[]
}

function emptyDetailInitialData(
  spec: SpecificationMeta | null,
  errors: SpecificationPreloadError[] = [],
  extras: Pick<
    RequirementsSpecificationDetailInitialData,
    'forbidden' | 'notFound'
  > = {},
): RequirementsSpecificationDetailInitialData {
  return {
    areas: [],
    availableNeedsRefs: [],
    availableRequirements: { hasMore: false, rows: [] },
    errors,
    leftNormReferenceOptions: [],
    requirementPackages: [],
    rightNormReferenceOptions: [],
    spec,
    ...extras,
    specificationImplementationTypes: [],
    specificationItemStatuses: [],
    specificationItems: [],
    specificationLifecycleStatuses: [],
    specificationGovernanceObjectTypes: [],
  }
}

export async function loadRequirementsSpecificationDetailInitialData({
  locale,
  slug,
}: {
  locale: 'en' | 'sv'
  slug: string
}): Promise<RequirementsSpecificationDetailInitialData> {
  const db = await getRequestSqlServerDataSource()
  const context = await createServerComponentRequestContext({
    path: `/specifications/${slug}`,
  })
  const specResult = await capture<SpecificationMeta | null>(
    'specification',
    null,
    async () =>
      (await getSpecificationBySlug(db, slug)) as SpecificationMeta | null,
  )

  if (!specResult.value) {
    return emptyDetailInitialData(
      null,
      specResult.error ? [specResult.error] : [],
      { notFound: true },
    )
  }
  const coAuthorHsaIds = await listSpecificationCoAuthorHsaIds(
    db,
    specResult.value.id,
  )

  if (
    !canReadSpecification(context, {
      coAuthorHsaIds,
      responsibleHsaId: specResult.value.responsibleHsaId,
    })
  ) {
    const denied = forbiddenError('Specification assignment is required', {
      reason: 'specification_assignment_required',
      specificationId: specResult.value.id,
    })
    await recordAuthorizationDenied(
      context,
      {
        kind: 'get_specification_items',
        specificationId: specResult.value.id,
        specificationSlug: slug,
      },
      denied,
    )
    const summary = await getSpecificationForbiddenSummaryBySlug(db, slug)
    return emptyDetailInitialData(
      null,
      specResult.error ? [specResult.error] : [],
      {
        forbidden: summary
          ? {
              responsible: summary.responsible,
              specification: {
                name: summary.name,
                uniqueId: summary.uniqueId,
              },
            }
          : undefined,
      },
    )
  }

  const spec: SpecificationMeta = {
    ...specResult.value,
    permissions: specificationPermissions(context, {
      coAuthorHsaIds,
      responsibleHsaId: specResult.value.responsibleHsaId,
    }),
  }

  const [
    areas,
    requirementPackages,
    needsRefs,
    specificationGovernanceObjectTypes,
    specificationImplementationTypes,
    specificationLifecycleStatuses,
    specificationItemStatuses,
    specificationItems,
    availableRequirements,
    leftNormReferenceOptions,
    rightNormReferenceOptions,
  ] = await Promise.all([
    capture<AreaOption[]>('requirement areas', [], async () =>
      (await listAreas(db)).map(area => ({ id: area.id, name: area.name })),
    ),
    capture<RequirementPackageOption[]>('requirement packages', [], async () =>
      (await listRequirementPackages(db)).map(pkg => ({
        id: pkg.id,
        name: pkg.name,
        purposeAndScope: pkg.purposeAndScope,
      })),
    ),
    capture<SpecificationNeedsReference[]>(
      'specification needs references',
      [],
      () => listSpecificationNeedsReferences(db, spec.id),
    ),
    capture<SpecificationTaxonomyItem[]>(
      'specification governance object types',
      [],
      () => listSpecificationGovernanceObjectTypes(db),
    ),
    capture<SpecificationTaxonomyItem[]>(
      'specification implementation types',
      [],
      () => listSpecificationImplementationTypes(db),
    ),
    capture<SpecificationTaxonomyItem[]>(
      'specification lifecycle statuses',
      [],
      () => listSpecificationLifecycleStatuses(db),
    ),
    capture<SpecificationItemStatusOption[]>('usage statuses', [], () =>
      listSpecificationItemStatusOptions(db),
    ),
    capture<SpecificationListItem[]>('requirement applications', [], () =>
      loadSpecificationItems(db, spec.id),
    ),
    capture<
      RequirementsSpecificationDetailInitialData['availableRequirements']
    >('available requirements', { hasMore: false, rows: [] }, () =>
      loadAvailableRequirements(db, locale),
    ),
    capture<NormReferenceOption[]>('left norm references', [], () =>
      listLinkedNormReferenceOptions(db),
    ),
    capture<NormReferenceOption[]>('right norm references', [], () =>
      listLinkedNormReferenceOptions(db, [3]),
    ),
  ])

  return {
    areas: areas.value,
    availableNeedsRefs: needsRefs.value,
    availableRequirements: availableRequirements.value,
    errors: [
      specResult.error,
      areas.error,
      requirementPackages.error,
      needsRefs.error,
      specificationGovernanceObjectTypes.error,
      specificationImplementationTypes.error,
      specificationLifecycleStatuses.error,
      specificationItemStatuses.error,
      specificationItems.error,
      availableRequirements.error,
      leftNormReferenceOptions.error,
      rightNormReferenceOptions.error,
    ].filter((error): error is SpecificationPreloadError => !!error),
    leftNormReferenceOptions: leftNormReferenceOptions.value,
    requirementPackages: requirementPackages.value,
    rightNormReferenceOptions: rightNormReferenceOptions.value,
    spec,
    specificationImplementationTypes: specificationImplementationTypes.value,
    specificationItemStatuses: specificationItemStatuses.value,
    specificationItems: specificationItems.value,
    specificationLifecycleStatuses: specificationLifecycleStatuses.value,
    specificationGovernanceObjectTypes:
      specificationGovernanceObjectTypes.value,
  }
}

export async function loadRequirementsSpecificationsInitialData(): Promise<RequirementsSpecificationsInitialData> {
  const db = await getRequestSqlServerDataSource()
  const context = await createServerComponentRequestContext({
    path: '/specifications',
  })
  const [
    specifications,
    governanceObjectTypes,
    implementationTypes,
    lifecycleStatuses,
  ] = await Promise.all([
    capture<Specification[]>('requirements specifications', [], async () => {
      const specs = (await listSpecificationsForActor(db, {
        actorHsaId: context.actor.hsaId,
        canReadAll: canReadAllSpecifications(context),
      })) as Specification[]
      const coAuthorIdsBySpecification =
        await listSpecificationCoAuthorHsaIdsBySpecification(
          db,
          specs.map(spec => spec.id),
        )
      return specs.map(spec => ({
        ...spec,
        permissions: specificationPermissions(context, {
          coAuthorHsaIds: coAuthorIdsBySpecification.get(spec.id) ?? [],
          responsibleHsaId: spec.responsibleHsaId,
        }),
      }))
    }),
    capture<SpecificationTaxonomyItem[]>(
      'specification governance object types',
      [],
      () => listSpecificationGovernanceObjectTypes(db),
    ),
    capture<SpecificationTaxonomyItem[]>(
      'specification implementation types',
      [],
      () => listSpecificationImplementationTypes(db),
    ),
    capture<SpecificationTaxonomyItem[]>(
      'specification lifecycle statuses',
      [],
      () => listSpecificationLifecycleStatuses(db),
    ),
  ])

  return {
    collectionPermissions: {
      canCreateSpecification: canCreateSpecification(context),
    },
    errors: [
      specifications.error,
      governanceObjectTypes.error,
      implementationTypes.error,
      lifecycleStatuses.error,
    ].filter((error): error is SpecificationPreloadError => !!error),
    implementationTypes: implementationTypes.value,
    lifecycleStatuses: lifecycleStatuses.value,
    governanceObjectTypes: governanceObjectTypes.value,
    specifications: specifications.value,
  }
}
