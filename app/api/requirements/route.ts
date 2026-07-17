import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  businessTextSchema,
  optionalBusinessTextSchema,
  optionalQueryArraySchema,
  optionalSearchStringSchema,
  parseSearchParams,
  positiveIntegerSchema,
  positiveIntegerStringSchema,
  queryBooleanStringSchema,
  uniquePositiveIntegerArraySchema,
} from '@/lib/http/validation'
import { queryRequirementList } from '@/lib/requirements/list-query'
import {
  DEFAULT_REQUIREMENT_SORT,
  REQUIREMENT_SORT_FIELDS,
} from '@/lib/requirements/list-view'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { toHttpErrorPayload } from '@/lib/requirements/service'

const optionalBodyIdSchema = positiveIntegerSchema
  .nullable()
  .optional()
  .transform(value => value ?? undefined)

const optionalBodyIdArraySchema = uniquePositiveIntegerArraySchema()
  .nullable()
  .optional()
  .transform(value => value ?? undefined)

const requirementsQuerySchema = z
  .object({
    areaIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    categoryIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    descriptionSearch: optionalSearchStringSchema,
    limit: positiveIntegerStringSchema
      .refine(value => value <= 200, {
        message: 'Expected a page size no greater than 200',
      })
      .optional(),
    locale: z.enum(['en', 'sv']).optional().default('en'),
    needsReferenceIds: optionalQueryArraySchema(positiveIntegerStringSchema),
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
    specificationItemStatusIds: optionalQueryArraySchema(
      positiveIntegerStringSchema,
    ),
    statuses: optionalQueryArraySchema(positiveIntegerStringSchema),
    typeIds: optionalQueryArraySchema(positiveIntegerStringSchema),
    uniqueIdSearch: optionalSearchStringSchema,
  })
  .strict()

const requirementMutationSchema = z
  .object({
    acceptanceCriteria: optionalBusinessTextSchema,
    areaId: positiveIntegerSchema,
    categoryId: optionalBodyIdSchema,
    description: businessTextSchema,
    normReferenceIds: optionalBodyIdArraySchema,
    qualityCharacteristicId: optionalBodyIdSchema,
    requirementPackageIds: optionalBodyIdArraySchema,
    verifiable: z.boolean().optional().default(false),
    priorityLevelId: optionalBodyIdSchema,
    typeId: optionalBodyIdSchema,
    verificationMethod: optionalBusinessTextSchema,
  })
  .strict()

type RequirementMutationBody = z.infer<typeof requirementMutationSchema>

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const parsedQuery = parseSearchParams(
    url.searchParams,
    requirementsQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response

  const {
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
    statuses = [],
    typeIds = [],
    uniqueIdSearch,
  } = parsedQuery.data

  try {
    const { authorization, context, db } =
      await createRequirementsRestRuntime(request)
    const result = await queryRequirementList(
      db,
      {
        capacitySurface: 'rest',
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
          statuses: statuses.length > 0 ? statuses : undefined,
          typeIds: typeIds.length > 0 ? typeIds : undefined,
          uniqueIdSearch,
        },
        limit,
        locale,
        cursor,
        sort: {
          by: sortBy ?? DEFAULT_REQUIREMENT_SORT.by,
          direction: sortDirection ?? DEFAULT_REQUIREMENT_SORT.direction,
        },
      },
      { authorization, context },
    )
    return NextResponse.json({
      pagination: result.pagination,
      requirements: result.requirements,
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const POST = secureMutationRoute<RequirementMutationBody>({
  bodySchema: requirementMutationSchema,
  policy: requirementsMutationPolicy<RequirementMutationBody>(({ body }) => ({
    areaId: body.areaId,
    kind: 'manage_requirement',
    operation: 'create',
  })),
  handler: async ({ body, context, request }) => {
    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
      })
      const result = await service.manageRequirement(context, {
        operation: 'create',
        requirement: {
          acceptanceCriteria: body.acceptanceCriteria,
          areaId: body.areaId,
          categoryId: body.categoryId,
          description: body.description,
          normReferenceIds: body.normReferenceIds,
          verifiable: body.verifiable,
          verificationMethod: body.verificationMethod,
          requirementPackageIds: body.requirementPackageIds,
          qualityCharacteristicId: body.qualityCharacteristicId,
          priorityLevelId: body.priorityLevelId,
          typeId: body.typeId,
        },
      })

      return NextResponse.json(result.result, { status: 201 })
    } catch (error) {
      logSanitizedError('[API] Failed to create requirement', error)
      const { body: errorBody, status } = toHttpErrorPayload(error)
      return NextResponse.json(errorBody, { status })
    }
  },
})
