import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSpecificationById } from '@/lib/dal/requirements-specifications'
import { getRequestSqlServerDataSource } from '@/lib/db'
import { logSanitizedError } from '@/lib/http/safe-errors'
import {
  requirementsMutationPolicy,
  secureMutationRoute,
} from '@/lib/http/secure-mutation-route'
import {
  idParamSchema,
  nullableBoundedDbStringSchema,
  nullableBusinessTextSchema,
  parseRouteParams,
  parseSearchParams,
  positiveIntegerSchema,
  routeSegmentSchema,
  uniquePositiveIntegerArraySchema,
} from '@/lib/http/validation'
import { isRequirementsServiceError } from '@/lib/requirements/errors'
import { toHttpErrorPayload } from '@/lib/requirements/http-errors'
import { createRequirementsRestRuntime } from '@/lib/requirements/server'
import { specificationItemPageQuerySchema } from '@/lib/requirements/specification-item-query'
import { SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT } from '@/lib/specifications/selection-action-limit'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const ADD_REQUIREMENTS_ERROR = 'Failed to add requirements'

const specificationParamSchema = idParamSchema

const requirementIdsSchema = uniquePositiveIntegerArraySchema().min(1)

const itemRefsSchema = z
  .array(routeSegmentSchema)
  .min(1)
  .max(SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT)
  .refine(values => new Set(values).size === values.length, {
    message: 'Expected unique item references',
  })

const postItemsSchema = z
  .object({
    needsReferenceDescription: nullableBusinessTextSchema.optional(),
    needsReferenceId: positiveIntegerSchema.nullable().optional(),
    needsReferenceText: nullableBoundedDbStringSchema.optional(),
    requirementIds: requirementIdsSchema,
  })
  .strict()
  .refine(
    value =>
      value.needsReferenceId == null ||
      value.needsReferenceText == null ||
      value.needsReferenceText.trim() === '',
    {
      message:
        'Provide either needsReferenceId or needsReferenceText, not both',
      path: ['needsReferenceText'],
    },
  )
  .refine(
    value =>
      value.needsReferenceText != null ||
      value.needsReferenceDescription == null ||
      value.needsReferenceDescription.trim() === '',
    {
      message: 'needsReferenceDescription requires needsReferenceText',
      path: ['needsReferenceDescription'],
    },
  )

const patchItemsSchema = z
  .object({
    itemRefs: itemRefsSchema,
    needsReferenceId: positiveIntegerSchema.nullable(),
  })
  .strict()

const deleteItemsSchema = z.union([
  z
    .object({
      itemRefs: itemRefsSchema,
    })
    .strict(),
  z
    .object({
      requirementIds: z
        .array(positiveIntegerSchema)
        .min(1)
        .max(SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT)
        .refine(values => new Set(values).size === values.length, {
          message: 'Expected unique positive integers',
        }),
    })
    .strict(),
])

export async function GET(
  request: NextRequest,
  { params }: { params: Params },
) {
  const parsedParams = await parseRouteParams(params, specificationParamSchema)
  if (!parsedParams.ok) {
    return parsedParams.response
  }
  const parsedQuery = parseSearchParams(
    new URL(request.url).searchParams,
    specificationItemPageQuerySchema,
  )
  if (!parsedQuery.ok) return parsedQuery.response
  try {
    const { id } = parsedParams.data
    const db = await getRequestSqlServerDataSource()
    const specification = await getSpecificationById(db, id)
    if (!specification)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { context, service } = await createRequirementsRestRuntime(request, {
      db,
    })
    const payload = await service.getSpecificationItems(context, {
      ...parsedQuery.data,
      capacitySurface: 'rest',
      responseFormat: 'json',
      specificationId: specification.id,
    })
    return NextResponse.json({
      items: payload.items,
      pagination: payload.pagination,
    })
  } catch (error) {
    const { body, status } = toHttpErrorPayload(error)
    return NextResponse.json(body, { status })
  }
}

export const POST = secureMutationRoute({
  bodySchema: postItemsSchema,
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof postItemsSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ body, params }) => ({
    kind: 'add_to_specification',
    requirementIds: body.requirementIds,
    specificationId: params.id,
  })),
  handler: async ({ body, context, params, request }) => {
    const { id } = params
    const db = await getRequestSqlServerDataSource()

    const specification = await getSpecificationById(db, id)
    if (!specification)
      return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { requirementIds, needsReferenceId, needsReferenceText } = body

    try {
      const { service } = await createRequirementsRestRuntime(request, {
        context,
        db,
      })
      const payload = await service.addToSpecification(context, {
        specificationId: specification.id,
        requirementIds,
        needsReferenceDescription: body.needsReferenceDescription,
        needsReferenceId,
        needsReferenceText,
        responseFormat: 'json',
      })
      return NextResponse.json(
        { addedCount: payload.addedCount, ok: true },
        { status: payload.addedCount > 0 ? 201 : 200 },
      )
    } catch (error) {
      if (isRequirementsServiceError(error)) {
        const { body, status } = toHttpErrorPayload(error)
        return NextResponse.json(body, { status })
      }

      logSanitizedError(
        'Failed to add requirements to requirements specification',
        error,
      )
      return NextResponse.json(
        { error: ADD_REQUIREMENTS_ERROR },
        { status: 500 },
      )
    }
  },
})

export const PATCH = secureMutationRoute({
  bodySchema: patchItemsSchema,
  errorMessage: 'Failed to update requirement applications',
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof patchItemsSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ body, params }) => ({
    itemRefs: body.itemRefs,
    kind: 'manage_requirement_applications',
    operation: 'update',
    specificationId: params.id,
  })),
  handler: async ({ body, context, db, params, request }) => {
    const { service } = await createRequirementsRestRuntime(request, {
      context,
      db,
    })
    const outcome = await service.mutateRequirementApplications(context, {
      fields: { needsReferenceId: body.needsReferenceId },
      itemRefs: body.itemRefs,
      operation: 'update',
      specificationId: params.id,
    })
    if (outcome.operation !== 'update') {
      throw new Error('Unexpected requirement application mutation outcome')
    }

    return NextResponse.json({ ok: true, updatedCount: outcome.updatedCount })
  },
})

export const DELETE = secureMutationRoute({
  bodySchema: deleteItemsSchema,
  errorMessage: 'Failed to remove requirement applications',
  paramsSchema: specificationParamSchema,
  policy: requirementsMutationPolicy<
    z.infer<typeof deleteItemsSchema>,
    z.infer<typeof specificationParamSchema>
  >(({ body, params }) => ({
    ...('itemRefs' in body ? { itemRefs: body.itemRefs } : {}),
    kind: 'manage_requirement_applications',
    operation: 'remove',
    ...('requirementIds' in body
      ? { requirementIds: body.requirementIds }
      : {}),
    specificationId: params.id,
  })),
  handler: async ({ body, context, db, params, request }) => {
    const { service } = await createRequirementsRestRuntime(request, {
      context,
      db,
    })
    const outcome = await service.mutateRequirementApplications(context, {
      ...body,
      operation: 'remove',
      specificationId: params.id,
    })
    if (outcome.operation !== 'remove') {
      throw new Error('Unexpected requirement application mutation outcome')
    }
    return NextResponse.json(
      'itemRefs' in body
        ? {
            deletedLibraryCount: outcome.removedLibraryCount,
            deletedSpecificationLocalCount:
              outcome.removedSpecificationLocalCount,
            ok: true,
            removedCount: outcome.removedCount,
          }
        : { ok: true, removedCount: outcome.removedCount },
    )
  },
})
