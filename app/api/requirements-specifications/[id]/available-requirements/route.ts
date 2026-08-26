import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  idParamSchema,
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  parseRouteParams,
  parseSearchParams,
  positiveIntegerStringSchema,
  queryBooleanStringSchema,
} from '@/lib/http/validation'
import {
  DEFAULT_REQUIREMENT_SORT,
  REQUIREMENT_SORT_FIELDS,
} from '@/lib/requirements/list-view'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'

type Params = Promise<{ id: string }>

const paramsSchema = idParamSchema

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
    cursor: z.string().min(1).max(512).optional(),
    qualityCharacteristicIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    requirementPackageIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    verifiable: optionalQueryArraySchema(queryBooleanStringSchema),
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
    const { context, db, service } =
      await createRequirementsRestRuntime(request)
    const specification = await getSpecificationById(db, parsedParams.data.id)
    if (!specification) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const specificationId = specification.id

    const {
      applyRequirementSelectionFilter,
      areaIds = [],
      categoryIds = [],
      descriptionSearch,
      limit,
      locale,
      normReferenceIds = [],
      cursor,
      qualityCharacteristicIds = [],
      requirementPackageIds = [],
      verifiable = [],
      priorityLevelIds = [],
      sortBy,
      sortDirection,
      typeIds = [],
      uniqueIdSearch,
    } = parsedQuery.data

    const result = await service.getAvailableSpecificationRequirements(
      context,
      {
        applyRequirementSelectionFilter:
          applyRequirementSelectionFilter === 'true',
        capacitySurface: 'rest',
        cursor,
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
          verifiable: verifiable.length > 0 ? verifiable : undefined,
          priorityLevelIds:
            priorityLevelIds.length > 0 ? priorityLevelIds : undefined,
          typeIds: typeIds.length > 0 ? typeIds : undefined,
          uniqueIdSearch,
        },
        limit,
        locale,
        sort: {
          by: sortBy ?? DEFAULT_REQUIREMENT_SORT.by,
          direction: sortDirection ?? DEFAULT_REQUIREMENT_SORT.direction,
        },
        specificationId,
      },
    )

    return NextResponse.json(result)
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    if (status >= 500) {
      logSanitizedError(
        '[API] Failed to list available requirements for specification',
        error,
        {
          specificationId: parsedParams.data.id,
        },
      )
    }
    return NextResponse.json(body, { status })
  }
}
