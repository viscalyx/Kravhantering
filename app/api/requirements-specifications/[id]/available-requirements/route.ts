import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getExistingSpecificationRequirementIds,
  getRequirementSelectionFilterForSpecification,
  resolveSpecificationId,
} from '@/lib/dal/requirement-selection-questions'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  nonNegativeIntegerStringSchema,
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  parseRouteParams,
  parseSearchParams,
  positiveIntegerStringSchema,
  queryBooleanStringSchema,
  specificationIdOrSlugSchema,
} from '@/lib/http/validation'
import { queryRequirementList } from '@/lib/requirements/list-query'
import {
  DEFAULT_REQUIREMENT_SORT,
  REQUIREMENT_SORT_FIELDS,
} from '@/lib/requirements/list-view'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'
import { authorize } from '@/lib/requirements/service-shared'
import { STATUS_PUBLISHED } from '@/lib/requirements/status-constants.mjs'

type Params = Promise<{ id: string }>

const paramsSchema = z.object({ id: specificationIdOrSlugSchema }).strict()

const querySchema = z
  .object({
    areaIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    applyRequirementSelectionFilter: queryBooleanStringSchema.optional(),
    categoryIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    descriptionSearch: optionalSearchStringSchema,
    limit: positiveIntegerStringSchema
      .refine(value => value <= 200, {
        message: 'Expected a page size no greater than 200',
      })
      .optional(),
    locale: z.enum(['en', 'sv']).optional().default('en'),
    normReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    offset: nonNegativeIntegerStringSchema.optional(),
    qualityCharacteristicIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    requirementPackageIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    requiresTesting: optionalQueryArraySchema(queryBooleanStringSchema),
    priorityLevelIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    sortBy: z.enum(REQUIREMENT_SORT_FIELDS).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    typeIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    uniqueIdSearch: optionalSearchStringSchema,
  })
  .strict()

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, paramsSchema)
  if (!parsedParams.ok) return parsedParams.response
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    querySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response

  try {
    const { authorization, context, db } =
      await createRequirementsRestRuntime(request)
    const specificationId = await resolveSpecificationId(
      db,
      parsedParams.data.id,
    )
    if (!specificationId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await authorize(
      authorization,
      {
        kind: 'get_specification_items',
        specificationId,
        specificationSlug: /^\d+$/.test(parsedParams.data.id)
          ? undefined
          : parsedParams.data.id,
      },
      context,
    )

    const [selectionFilter, existingRequirementIds] = await Promise.all([
      getRequirementSelectionFilterForSpecification(db, specificationId),
      getExistingSpecificationRequirementIds(db, specificationId),
    ])

    const shouldApplyRequirementSelectionFilter =
      parsedQuery.data.applyRequirementSelectionFilter === 'true' &&
      selectionFilter.hasRequirementSelection
    const responseSelectionFilter = {
      ...selectionFilter,
      applied: shouldApplyRequirementSelectionFilter,
    }

    if (
      shouldApplyRequirementSelectionFilter &&
      selectionFilter.requirementIds.length === 0
    ) {
      return NextResponse.json({
        pagination: {
          count: 0,
          hasMore: false,
          limit: parsedQuery.data.limit ?? 200,
          nextOffset: null,
          offset: parsedQuery.data.offset ?? 0,
          total: 0,
        },
        requirements: [],
        selectionFilter: responseSelectionFilter,
      })
    }

    const {
      areaIds = [],
      categoryIds = [],
      descriptionSearch,
      limit,
      locale,
      normReferenceIds = [],
      offset,
      qualityCharacteristicIds = [],
      requirementPackageIds = [],
      requiresTesting = [],
      priorityLevelIds = [],
      sortBy,
      sortDirection,
      typeIds = [],
      uniqueIdSearch,
    } = parsedQuery.data

    const result = await queryRequirementList(
      db,
      {
        excludeRequirementIds: existingRequirementIds,
        filters: {
          areaIds: areaIds.length > 0 ? areaIds : undefined,
          categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
          descriptionSearch,
          normReferenceIds:
            normReferenceIds.length > 0 ? normReferenceIds : undefined,
          qualityCharacteristicIds:
            qualityCharacteristicIds.length > 0
              ? qualityCharacteristicIds
              : undefined,
          requirementPackageIds:
            requirementPackageIds.length > 0
              ? requirementPackageIds
              : undefined,
          requiresTesting:
            requiresTesting.length > 0 ? requiresTesting : undefined,
          priorityLevelIds:
            priorityLevelIds.length > 0 ? priorityLevelIds : undefined,
          statuses: [STATUS_PUBLISHED],
          typeIds: typeIds.length > 0 ? typeIds : undefined,
          uniqueIdSearch,
        },
        limit,
        locale,
        offset,
        ...(shouldApplyRequirementSelectionFilter
          ? { requirementIds: selectionFilter.requirementIds }
          : {}),
        sort: {
          by: sortBy ?? DEFAULT_REQUIREMENT_SORT.by,
          direction: sortDirection ?? DEFAULT_REQUIREMENT_SORT.direction,
        },
      },
      { authorization, context },
    )

    return NextResponse.json({
      ...result,
      selectionFilter: responseSelectionFilter,
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    if (status >= 500) {
      logSanitizedError(
        '[API] Failed to list available requirements for specification',
        error,
        {
          specificationIdOrSlug: parsedParams.data.id,
        },
      )
    }
    return NextResponse.json(body, { status })
  }
}
